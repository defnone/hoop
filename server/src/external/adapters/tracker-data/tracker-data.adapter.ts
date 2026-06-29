import { trackersConf } from '@server/shared/trackers-conf';
import { parse, type HTMLElement } from 'node-html-parser';
import jschardet from 'jschardet';
import iconv from 'iconv-lite';
import type {
  EpAndSeason,
  TorrentDataResult,
  TrackerDataParams,
} from './tracker-data.types';
import { customFetch } from '@server/shared/custom-fetch';
import { TrackerAuth } from './tracker-data.auth';
import type { TrackerConf } from '@server/shared/types';
import { SettingsService } from '@server/features/settings/settings.service';
import logger from '@server/lib/logger';
import { CloudflareChallengeError, isCloudflareChallenge } from './utils';
import {
  buildCookieHeader,
  fetchWithFlareSolverr,
  type FlareSolverrSolution,
} from './flaresolverr';

const DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS = 60;

export class TrackerDataAdapter {
  private timeout: number;
  private domRoot: HTMLElement | null = null;
  private cloudflareCookies: string = '';
  private cloudflareUserAgent: string = '';
  private rawTitle: string = '';
  private showTitle: string = '';
  private rawUrl: string;
  private trackerTorrentId: string;
  private magnet: string = '';
  private epAndSeason: EpAndSeason | null = null;
  private tConf: TrackerConf;
  private trackerAuth: TrackerAuth | null;
  private tracker: keyof typeof trackersConf;
  constructor({ url, tracker, trackerAuth, timeout }: TrackerDataParams) {
    const tConf = trackersConf[tracker];
    if (!tConf) throw new Error('Tracker not found');
    const trackerTorrentId = tConf.trackerId(url);
    if (!trackerTorrentId) throw new Error('Tracker id not found');
    this.rawUrl = url;
    this.tConf = tConf;
    this.trackerTorrentId = trackerTorrentId;
    this.trackerAuth = trackerAuth || null;
    this.timeout = timeout || 10_000;
    this.tracker = tracker;
  }

  private async fetchDom(
    url: string = this.rawUrl,
    cookies: string = '',
    tryAlternativeDomains = true,
  ): Promise<void> {
    try {
      const headers = this.buildRequestHeaders(cookies);
      const resp = await customFetch(url, { headers }, this.timeout);
      const buffer = await resp.arrayBuffer();
      const detectedEncoding =
        jschardet.detect(Buffer.from(buffer)).encoding || 'utf-8';
      const decodedContent = iconv.decode(
        Buffer.from(buffer),
        detectedEncoding,
      );
      const root = parse(decodedContent);
      if (!root) throw new Error('No dom found');

      if (resp.status === 403 || isCloudflareChallenge(root)) {
        logger.warn('Tracker page requires Cloudflare bypass', {
          url,
          tracker: this.tracker,
          status: resp.status,
          cloudflareChallenge: isCloudflareChallenge(root),
          flaresolverrCookiesAvailable: Boolean(this.cloudflareCookies),
          flaresolverrUserAgentAvailable: Boolean(this.cloudflareUserAgent),
        });
        await this.handleForbiddenResponse(url, cookies, root);
        return;
      }

      this.domRoot = root;
    } catch (e) {
      if (tryAlternativeDomains && isFetchTimeout(e)) {
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
            await this.fetchDom(alternativeUrl, cookies, false);
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

    let solution: FlareSolverrSolution;
    try {
      solution = await fetchWithFlareSolverr({
        serverUrl: settings.flaresolverrUrl,
        targetUrl: url,
        timeout: this.getFlareSolverrTimeout(
          settings.flaresolverrTimeoutSeconds,
        ),
        cookies: this.mergeCookieHeaders(cookies),
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

    this.cloudflareCookies = buildCookieHeader(solution.cookies);
    this.cloudflareUserAgent = solution.userAgent;
    this.domRoot = parse(solution.response);
    logger.info('FlareSolverr tracker page request succeeded', {
      url,
      tracker: this.tracker,
      status: solution.status,
      cookiesCount: solution.cookies.length,
      userAgentAvailable: Boolean(solution.userAgent),
    });
  }

  private async getAuth() {
    const settings = await new SettingsService().getSettings();

    if (!settings) throw new Error('No settings found');
    const dbCredentials = this.tConf.dbCredentials;
    if (!dbCredentials?.username || !dbCredentials?.password)
      throw new Error('No db credentials pattern found');

    const login = settings?.[dbCredentials?.username];
    const password = settings?.[dbCredentials?.password];

    if (!login || !password)
      throw new Error('No auth credentials found for ' + this.tracker);

    const baseUrl = new URL(this.rawUrl).origin;
    this.trackerAuth = new TrackerAuth({
      login: String(login),
      password: String(password),
      baseUrl,
      tracker: this.tracker,
    });
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
    const newUrl = new URL(this.rawUrl);

    if (this.tConf.isDifferentMagnetUrl) {
      if (!this.tConf.magnetUrl) throw new Error('No magnet url found');
      if (this.tConf.isAuthRequired && !this.trackerAuth) await this.getAuth();

      const cookies = this.tConf.isAuthRequired
        ? await this.trackerAuth?.getCookies()
        : '';

      const url = this.tConf.magnetUrl(
        newUrl.protocol,
        newUrl.host,
        this.trackerTorrentId,
      );
      await this.fetchDom(url.href, cookies);
    }

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
    await this.fetchDom();
    this.extractRawTitle();
    this.extractShowTitle();
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

  private buildRequestHeaders(cookies: string): HeadersInit {
    const headers: Record<string, string> = {};
    const mergedCookies = this.mergeCookieHeaders(cookies);

    if (mergedCookies) {
      headers.Cookie = mergedCookies;
    }

    if (this.cloudflareUserAgent) {
      headers['User-Agent'] = this.cloudflareUserAgent;
    }

    return headers;
  }

  private mergeCookieHeaders(cookies: string): string {
    return [cookies, this.cloudflareCookies].filter(Boolean).join('; ');
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
