import { trackersConf } from '@server/shared/trackers-conf';
import { parse, type HTMLElement } from 'node-html-parser';
import jschardet from 'jschardet';
import iconv from 'iconv-lite';
import type {
  EpAndSeason,
  TorrentDataResult,
  TrackerDataParams,
  TrackerAuthRequestOptions,
} from './tracker-data.types';
import { customFetch } from '@server/shared/custom-fetch';
import { TrackerAuth, TrackerAuthError } from './tracker-data.auth';
import type { TrackerConf } from '@server/shared/types';
import { SettingsService } from '@server/features/settings/settings.service';
import logger from '@server/lib/logger';
import { CloudflareChallengeError, isCloudflareChallenge } from './utils';
import { buildCookieHeader } from './flaresolverr';
import {
  clearCachedFlareSolverrSession,
  getCachedFlareSolverrSession,
  isFlareSolverrSessionUsable,
  resolveFlareSolverrSession,
  type FlareSolverrSession,
  type FlareSolverrSessionResult,
} from './flaresolverr-cache';
import {
  normalizeTrackerOrigin,
  trackerAuthCookieCache,
  type TrackerAuthCookieResult,
} from './tracker-data.auth-cache';

const DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS = 60;

type TrackerAuthRequest = TrackerAuthCookieResult & {
  url: string;
  origin: string;
};

export class TrackerDataAdapter {
  private timeout: number;
  private domRoot: HTMLElement | null = null;
  private cloudflareSession: FlareSolverrSession | null = null;
  private rawTitle: string = '';
  private showTitle: string = '';
  private rawUrl: string;
  private activeUrl: string;
  private trackerTorrentId: string;
  private magnet: string = '';
  private epAndSeason: EpAndSeason | null = null;
  private tConf: TrackerConf;
  private injectedTrackerAuth: TrackerAuth | null;
  private injectedAuthCookiesByOrigin = new Map<string, string>();
  private injectedAuthPendingByOrigin = new Map<string, Promise<string>>();
  private lastAuthRequest: TrackerAuthRequest | null = null;
  private authRefreshAttemptedUrls = new Set<string>();
  private tracker: keyof typeof trackersConf;
  constructor({ url, tracker, trackerAuth, timeout }: TrackerDataParams) {
    const tConf = trackersConf[tracker];
    if (!tConf) throw new Error('Tracker not found');
    const trackerTorrentId = tConf.trackerId(url);
    if (!trackerTorrentId) throw new Error('Tracker id not found');
    this.rawUrl = url;
    this.activeUrl = url;
    this.tConf = tConf;
    this.trackerTorrentId = trackerTorrentId;
    this.injectedTrackerAuth = trackerAuth || null;
    this.timeout = timeout || 10_000;
    this.tracker = tracker;
  }

  private async fetchDom(
    url: string = this.rawUrl,
    cookies: string = '',
    tryAlternativeDomains = true,
  ): Promise<void> {
    let authAttemptFailed = false;
    try {
      let requestCookies = cookies;
      let authRequest: TrackerAuthRequest | null = null;
      if (this.tConf.isAuthRequired) {
        authAttemptFailed = true;
        const authResult = await this.getAuthCookies(url);
        requestCookies = authResult.cookies;
        authRequest = {
          ...authResult,
          url,
          origin: normalizeTrackerOrigin(url),
        };
        authAttemptFailed = false;
      }

      const session = this.getFlareSolverrSession(url);
      const { response: resp, root } = await this.fetchPage(
        url,
        requestCookies,
        session,
      );
      this.lastAuthRequest = authRequest;

      if (
        authRequest?.source === 'cache' &&
        isInvalidTrackerAuthResponse(resp.status, root)
      ) {
        if (this.authRefreshAttemptedUrls.has(url)) {
          throw new Error('Tracker authentication cookie rejected');
        }

        this.authRefreshAttemptedUrls.add(url);
        authAttemptFailed = true;
        await this.refreshAuthCookies(url, authRequest.cookies);
        await this.fetchDom(url, '', false);
        authAttemptFailed = false;
        return;
      }

      if (resp.status === 403 || isCloudflareChallenge(root)) {
        logger.warn('Tracker page requires Cloudflare bypass', {
          url,
          tracker: this.tracker,
          status: resp.status,
          cloudflareChallenge: isCloudflareChallenge(root),
          flaresolverrCookiesAvailable: Boolean(session?.cookies.length),
          flaresolverrUserAgentAvailable: Boolean(session?.userAgent),
        });
        await this.handleForbiddenResponse(url, requestCookies, root, session);
        this.activeUrl = url;
        return;
      }

      this.domRoot = root;
      this.activeUrl = url;
    } catch (e) {
      const retryableAuthFailure =
        authAttemptFailed && e instanceof TrackerAuthError && e.retryable;
      if (
        tryAlternativeDomains &&
        (isFetchTimeout(e) || retryableAuthFailure)
      ) {
        for (const alternativeUrl of getAlternativeTrackerUrls(
          url,
          this.tConf.urls,
        )) {
          logger.warn('Retrying tracker page with alternative domain', {
            url,
            alternativeUrl,
            tracker: this.tracker,
          });

          try {
            const alternativeCookies = this.tConf.isAuthRequired ? '' : cookies;
            await this.fetchDom(alternativeUrl, alternativeCookies, false);
            return;
          } catch (alternativeError) {
            logger.warn('Alternative tracker domain request failed', {
              url: alternativeUrl,
              tracker: this.tracker,
              error: this.describeError(alternativeError),
            });
          }
        }
      }

      logger.error('Tracker page fetch failed', {
        url,
        tracker: this.tracker,
        error: this.describeError(e),
      });
      throw new Error(`Error fetching ${url}: ${this.getErrorMessage(e)}`, {
        cause: e,
      });
    }
  }

  private async handleForbiddenResponse(
    url: string,
    cookies: string,
    root: HTMLElement,
    sessionUsed: FlareSolverrSession | null,
  ): Promise<void> {
    if (!isCloudflareChallenge(root)) {
      throw new Error('Server responded with 403');
    }

    const settings = await new SettingsService().getSettings();
    logger.warn('Cloudflare challenge detected on tracker page', {
      url,
      tracker: this.tracker,
      flaresolverrEnabled: settings?.flaresolverrEnabled ?? false,
      flaresolverrUrlConfigured: Boolean(settings?.flaresolverrUrl),
    });

    if (!settings?.flaresolverrEnabled) {
      throw new CloudflareChallengeError(
        'Cloudflare Challenge detected, FlareSolverr is disabled',
      );
    }

    if (!settings.flaresolverrUrl) {
      throw new Error('FlareSolverr URL is not configured');
    }

    if (!sessionUsed) {
      const cachedSession = getCachedFlareSolverrSession(this.tracker, url);

      if (cachedSession) {
        this.cloudflareSession = cachedSession;
        const cachedResponse = await this.fetchPage(
          url,
          cookies,
          cachedSession,
        );

        if (
          cachedResponse.response.status === 403 &&
          !isCloudflareChallenge(cachedResponse.root)
        ) {
          throw new Error('Server responded with 403');
        }

        if (
          cachedResponse.response.status !== 403 &&
          !isCloudflareChallenge(cachedResponse.root)
        ) {
          this.domRoot = cachedResponse.root;
          this.activeUrl = url;
          return;
        }

        clearCachedFlareSolverrSession(this.tracker, url, cachedSession);
        this.cloudflareSession = null;
      }
    } else {
      clearCachedFlareSolverrSession(this.tracker, url, sessionUsed);
      this.cloudflareSession = null;
    }

    let sessionResult: FlareSolverrSessionResult;
    try {
      sessionResult = await resolveFlareSolverrSession({
        tracker: this.tracker,
        serverUrl: settings.flaresolverrUrl,
        targetUrl: url,
        timeout: this.getFlareSolverrTimeout(
          settings.flaresolverrTimeoutSeconds,
        ),
        cookies: this.mergeCookieHeaders(url, cookies, null),
      });
    } catch (error) {
      logger.error('FlareSolverr tracker page request failed', {
        url,
        tracker: this.tracker,
        flaresolverrUrl: settings.flaresolverrUrl,
        error: this.describeError(error),
      });
      throw error;
    }

    this.cloudflareSession = sessionResult.session;

    if (sessionResult.response !== null) {
      this.domRoot = parse(sessionResult.response);
    } else {
      const retriedResponse = await this.fetchPage(
        url,
        cookies,
        sessionResult.session,
      );

      if (
        retriedResponse.response.status === 403 ||
        isCloudflareChallenge(retriedResponse.root)
      ) {
        clearCachedFlareSolverrSession(
          this.tracker,
          url,
          sessionResult.session,
        );
        throw new CloudflareChallengeError(
          'Cloudflare Challenge detected after applying FlareSolverr cookies',
        );
      }

      this.domRoot = retriedResponse.root;
    }

    logger.info('FlareSolverr tracker page request succeeded', {
      url,
      tracker: this.tracker,
      status: sessionResult.status,
      cookiesCount: sessionResult.session.cookies.length,
      userAgentAvailable: Boolean(sessionResult.session.userAgent),
    });
  }

  private async fetchPage(
    url: string,
    cookies: string,
    session: FlareSolverrSession | null,
  ): Promise<{ response: Response; root: HTMLElement }> {
    const headers = this.buildRequestHeaders(url, cookies, session);
    const response = await customFetch(url, { headers }, this.timeout);
    const buffer = await response.arrayBuffer();
    const detectedEncoding =
      jschardet.detect(Buffer.from(buffer)).encoding || 'utf-8';
    const decodedContent = iconv.decode(Buffer.from(buffer), detectedEncoding);
    const root = parse(decodedContent);
    if (!root) throw new Error('No dom found');

    return { response, root };
  }

  private async getAuth(url: string): Promise<TrackerAuth> {
    const settings = await new SettingsService().getSettings();

    if (!settings) {
      throw new TrackerAuthError('No settings found', 'configuration');
    }
    const dbCredentials = this.tConf.dbCredentials;
    if (!dbCredentials?.username || !dbCredentials?.password) {
      throw new TrackerAuthError(
        'No db credentials pattern found',
        'configuration',
      );
    }

    const login = settings?.[dbCredentials?.username];
    const password = settings?.[dbCredentials?.password];

    if (!login || !password) {
      throw new TrackerAuthError(
        'No auth credentials found for ' + this.tracker,
        'credentials',
      );
    }

    const baseUrl = new URL(url).origin;
    return new TrackerAuth({
      login: String(login),
      password: String(password),
      baseUrl,
      tracker: this.tracker,
    });
  }

  private async getAuthCookies(url: string): Promise<TrackerAuthCookieResult> {
    if (!this.tConf.isAuthRequired) {
      return { cookies: '', source: 'auth' };
    }

    const origin = normalizeTrackerOrigin(url);
    const injectedAuth = this.getInjectedTrackerAuth(origin);
    if (injectedAuth) {
      return this.getInjectedAuthCookies(origin, injectedAuth);
    }

    const createAuthCookies = async (
      requestOptions: TrackerAuthRequestOptions = {},
    ): Promise<string> => {
      const auth = await this.getAuth(url);
      return auth.getCookies(requestOptions);
    };

    try {
      return await trackerAuthCookieCache.getOrCreate(
        this.tracker,
        origin,
        () => createAuthCookies(),
      );
    } catch (error) {
      if (!(error instanceof TrackerAuthError) || error.kind !== 'challenge') {
        throw error;
      }

      const session = await this.resolveFlareSolverrAuthSession(url);
      const cookies = buildCookieHeader(session.cookies, url, session.host);

      return trackerAuthCookieCache.getOrCreate(this.tracker, origin, () =>
        createAuthCookies({
          cookies,
          userAgent: session.userAgent,
        }),
      );
    }
  }

  private async resolveFlareSolverrAuthSession(
    url: string,
  ): Promise<FlareSolverrSession> {
    const settings = await new SettingsService().getSettings();

    if (!settings?.flaresolverrEnabled) {
      throw new CloudflareChallengeError(
        'Cloudflare Challenge detected, FlareSolverr is disabled',
      );
    }

    if (!settings.flaresolverrUrl) {
      throw new Error('FlareSolverr URL is not configured');
    }

    const cachedSession = this.getFlareSolverrSession(url);
    if (cachedSession) {
      return cachedSession;
    }

    const sessionResult = await resolveFlareSolverrSession({
      tracker: this.tracker,
      serverUrl: settings.flaresolverrUrl,
      targetUrl: url,
      timeout: this.getFlareSolverrTimeout(settings.flaresolverrTimeoutSeconds),
      cookies: '',
    });

    this.cloudflareSession = sessionResult.session;
    return sessionResult.session;
  }

  private async getInjectedAuthCookies(
    origin: string,
    auth: TrackerAuth,
  ): Promise<TrackerAuthCookieResult> {
    const cachedCookies = this.injectedAuthCookiesByOrigin.get(origin);
    if (cachedCookies) {
      return { cookies: cachedCookies, source: 'cache' };
    }

    const pendingAuth = this.injectedAuthPendingByOrigin.get(origin);
    if (pendingAuth) {
      return { cookies: await pendingAuth, source: 'auth' };
    }

    const authPromise = auth.getCookies();
    this.injectedAuthPendingByOrigin.set(origin, authPromise);
    try {
      const cookies = await authPromise;
      if (!cookies) {
        throw new TrackerAuthError('No cookies found', 'credentials');
      }
      this.injectedAuthCookiesByOrigin.set(origin, cookies);
      return { cookies, source: 'auth' };
    } finally {
      if (this.injectedAuthPendingByOrigin.get(origin) === authPromise) {
        this.injectedAuthPendingByOrigin.delete(origin);
      }
    }
  }

  private getInjectedTrackerAuth(origin: string): TrackerAuth | null {
    return this.injectedTrackerAuth?.origin === origin
      ? this.injectedTrackerAuth
      : null;
  }

  private async refreshAuthCookies(
    url: string,
    staleCookies: string,
  ): Promise<TrackerAuthCookieResult> {
    const origin = normalizeTrackerOrigin(url);
    const injectedAuth = this.getInjectedTrackerAuth(origin);
    if (injectedAuth) {
      if (this.injectedAuthCookiesByOrigin.get(origin) === staleCookies) {
        this.injectedAuthCookiesByOrigin.delete(origin);
      }
    } else {
      trackerAuthCookieCache.invalidate(this.tracker, origin, staleCookies);
    }
    return this.getAuthCookies(url);
  }

  private extractRawTitle() {
    const rawTitle = this.domRoot
      ?.querySelector(this.tConf?.titleSelector)
      ?.textContent?.trim();
    if (!rawTitle) throw new Error('No raw title found');
    this.rawTitle = rawTitle;
  }

  private extractShowTitle() {
    const title = this.tConf.showTitle(this.rawTitle);
    if (!title) throw new Error('No title found');
    this.showTitle = title.trim();
  }

  private async extractTitlesWithDomainFallback(): Promise<void> {
    try {
      this.extractRawTitle();
      this.extractShowTitle();
      return;
    } catch (error) {
      try {
        if (await this.refreshInvalidCachedAuthPage()) {
          this.extractRawTitle();
          this.extractShowTitle();
          return;
        }
      } catch (refreshError) {
        if (isNonRetryableAuthError(refreshError)) {
          throw refreshError;
        }
      }

      for (const alternativeUrl of getAlternativeTrackerUrls(
        this.activeUrl,
        this.tConf.urls,
      )) {
        logger.warn('Retrying invalid tracker page with alternative domain', {
          url: this.activeUrl,
          alternativeUrl,
          tracker: this.tracker,
          error: this.describeError(error),
        });

        try {
          await this.fetchDom(alternativeUrl, '', false);
          try {
            this.extractRawTitle();
            this.extractShowTitle();
            return;
          } catch (alternativeError) {
            try {
              if (await this.refreshInvalidCachedAuthPage()) {
                this.extractRawTitle();
                this.extractShowTitle();
                return;
              }
            } catch (refreshError) {
              if (isNonRetryableAuthError(refreshError)) {
                throw refreshError;
              }
            }
            throw alternativeError;
          }
        } catch (alternativeError) {
          logger.warn('Alternative tracker page is invalid', {
            url: alternativeUrl,
            tracker: this.tracker,
            error: this.describeError(alternativeError),
          });
        }
      }

      throw error;
    }
  }

  private async refreshInvalidCachedAuthPage(): Promise<boolean> {
    const authRequest = this.lastAuthRequest;
    if (
      !authRequest ||
      authRequest.source !== 'cache' ||
      this.authRefreshAttemptedUrls.has(authRequest.url)
    ) {
      return false;
    }

    this.authRefreshAttemptedUrls.add(authRequest.url);
    await this.refreshAuthCookies(authRequest.url, authRequest.cookies);
    await this.fetchDom(authRequest.url, '', false);
    return true;
  }

  private extractEpsAndSeason() {
    for (const pattern of this.tConf.epsAndSeasonRegExps) {
      const match = this.rawTitle.match(pattern);
      if (match) {
        if (match.length === 5) {
          this.epAndSeason = {
            season: match[1] ? parseInt(match[1]) : 0,
            startEp: match[2] ? parseInt(match[2]) : 0,
            endEp: match[3] ? parseInt(match[3]) : 0,
            totalEp: match[4] ? parseInt(match[4]) : 0,
          };
        } else if (match.length === 4) {
          this.epAndSeason = {
            season: match[1] ? parseInt(match[1]) : 0,
            startEp: match[2] ? parseInt(match[2]) : 0,
            endEp: match[2] ? parseInt(match[2]) : 0,
            totalEp: match[3] ? parseInt(match[3]) : 0,
          };
        }
        return;
      }
    }
    throw new Error('No episodes and season found: ' + this.rawTitle);
  }

  private async extractMagnet() {
    const newUrl = new URL(this.activeUrl);

    if (this.tConf.isDifferentMagnetUrl) {
      if (!this.tConf.magnetUrl) throw new Error('No magnet url found');

      const url = this.tConf.magnetUrl(
        newUrl.protocol,
        newUrl.host,
        this.trackerTorrentId,
      );
      await this.fetchDom(url.href);

      try {
        this.extractMagnetFromCurrentDom();
        return;
      } catch (error) {
        const refreshed = await this.refreshInvalidCachedAuthPage();
        if (!refreshed) {
          throw error;
        }
        this.extractMagnetFromCurrentDom();
        return;
      }
    }

    this.extractMagnetFromCurrentDom();
  }

  private extractMagnetFromCurrentDom(): void {
    const currentRoot = this.domRoot;

    if (!currentRoot) {
      throw new Error('No dom on getMagnet');
    }

    const magnetElement = currentRoot.querySelector(this.tConf.magnetSelector);

    if (!magnetElement) {
      throw new Error('No magnet element found');
    }

    const href = magnetElement.getAttribute('href');
    if (href && href.startsWith('magnet:')) {
      this.magnet = href;
      return;
    }

    if (!magnetElement.textContent) {
      throw new Error('No magnet element found');
    }

    const magnetMatch = magnetElement.textContent.match(
      this.tConf.magnetRegExp,
    );

    if (!magnetMatch) {
      throw new Error('No magnet match found');
    }

    this.magnet = magnetMatch[1] || '';
    if (!this.magnet) throw new Error('No magnet match found');
  }

  public async collect(): Promise<TorrentDataResult> {
    await this.fetchDom(this.rawUrl);
    await this.extractTitlesWithDomainFallback();
    this.extractEpsAndSeason();
    await this.extractMagnet();
    return {
      torrentId: this.trackerTorrentId,
      rawTitle: this.rawTitle,
      showTitle: this.showTitle,
      epAndSeason: this.epAndSeason,
      magnet: this.magnet,
    };
  }

  private buildRequestHeaders(
    url: string,
    cookies: string,
    session: FlareSolverrSession | null,
  ): HeadersInit {
    const headers: Record<string, string> = {};
    const mergedCookies = this.mergeCookieHeaders(url, cookies, session);

    if (mergedCookies) {
      headers.Cookie = mergedCookies;
    }

    if (session?.userAgent) {
      headers['User-Agent'] = session.userAgent;
    }

    return headers;
  }

  private mergeCookieHeaders(
    url: string,
    cookies: string,
    session: FlareSolverrSession | null,
  ): string {
    const cloudflareCookies = session
      ? buildCookieHeader(session.cookies, url, session.host)
      : '';
    return [cookies, cloudflareCookies].filter(Boolean).join('; ');
  }

  private getFlareSolverrSession(url: string): FlareSolverrSession | null {
    const cachedSession = getCachedFlareSolverrSession(this.tracker, url);
    if (cachedSession) {
      return cachedSession;
    }

    if (
      this.cloudflareSession &&
      isFlareSolverrSessionUsable(this.cloudflareSession, url)
    ) {
      return this.cloudflareSession;
    }

    this.cloudflareSession = null;
    return null;
  }

  private getFlareSolverrTimeout(timeoutSeconds: number | null): number {
    const resolvedSeconds =
      timeoutSeconds ?? DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS;
    return Math.max(1, resolvedSeconds) * 1000;
  }

  private describeError(error: unknown): Record<string, unknown> {
    if (!(error instanceof Error)) {
      return { message: String(error) };
    }

    return {
      name: error.name,
      message: error.message,
      cause: this.describeErrorCause(error.cause),
      stack: error.stack,
    };
  }

  private describeErrorCause(cause: unknown): Record<string, unknown> | null {
    if (!cause) {
      return null;
    }

    if (!(cause instanceof Error)) {
      return { message: String(cause) };
    }

    return {
      name: cause.name,
      message: cause.message,
      cause: this.describeErrorCause(cause.cause),
      stack: cause.stack,
    };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function isFetchTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.endsWith('after 3 attempts: Timeout error')
  );
}

function isInvalidTrackerAuthResponse(
  status: number,
  root: HTMLElement,
): boolean {
  return !isCloudflareChallenge(root) && (status === 401 || status === 403);
}

function isNonRetryableAuthError(error: unknown): boolean {
  return error instanceof TrackerAuthError && !error.retryable;
}

function getAlternativeTrackerUrls(url: string, domains: string[]): string[] {
  const sourceUrl = new URL(url);
  const sourceHostname = sourceUrl.hostname.replace(/^www\./, '');

  return domains
    .filter((domain) => domain !== sourceHostname)
    .map((domain) => {
      const alternativeUrl = new URL(sourceUrl);
      alternativeUrl.hostname = domain;
      return alternativeUrl.href;
    });
}
