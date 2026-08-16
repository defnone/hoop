import { customFetch } from '@server/shared/custom-fetch';
import logger from '@server/lib/logger';

const FLARESOLVERR_SOLVE_ATTEMPTS = 3;

export type FlareSolverrCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: string;
};

export type FlareSolverrSolution = {
  status: number;
  response: string;
  cookies: FlareSolverrCookie[];
  userAgent: string;
};

type FlareSolverrResponse = {
  status: string;
  message?: string;
  solution?: FlareSolverrSolution;
};

type RequestGetPayload = {
  cmd: 'request.get';
  url: string;
  maxTimeout: number;
  cookies?: FlareSolverrCookie[];
};

type SessionsListPayload = {
  cmd: 'sessions.list';
};

export async function fetchWithFlareSolverr(params: {
  serverUrl: string;
  targetUrl: string;
  timeout: number;
  cookies: string;
}): Promise<FlareSolverrSolution> {
  const endpoint = new URL('v1', normalizeServerUrl(params.serverUrl));
  const payload: RequestGetPayload = {
    cmd: 'request.get',
    url: params.targetUrl,
    maxTimeout: params.timeout,
  };
  const parsedCookies = parseCookieHeader(params.cookies);

  if (parsedCookies.length > 0) {
    payload.cookies = parsedCookies;
  }

  for (let attempt = 1; attempt <= FLARESOLVERR_SOLVE_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await customFetch(
        endpoint.href,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        params.timeout + 5_000,
        1,
      );
    } catch (error) {
      if (attempt === FLARESOLVERR_SOLVE_ATTEMPTS) {
        throw error;
      }

      logger.warn('Retrying FlareSolverr request after transport error', {
        targetUrl: params.targetUrl,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: FLARESOLVERR_SOLVE_ATTEMPTS,
        error: getErrorMessage(error),
      });
      continue;
    }

    const body = await parseFlareSolverrResponse(response, endpoint);

    if (!response.ok || body.status !== 'ok' || !body.solution) {
      const errorMessage = body.message || 'FlareSolverr request failed';
      const shouldRetry =
        attempt < FLARESOLVERR_SOLVE_ATTEMPTS &&
        isChallengeSolveTimeout(errorMessage);

      if (shouldRetry) {
        logger.warn('Retrying FlareSolverr challenge solve after timeout', {
          targetUrl: params.targetUrl,
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: FLARESOLVERR_SOLVE_ATTEMPTS,
        });
        continue;
      }

      throw new Error(errorMessage);
    }

    if (!body.solution.response) {
      throw new Error('FlareSolverr response body is empty');
    }

    return body.solution;
  }

  throw new Error('FlareSolverr challenge solve failed');
}

export async function verifyFlareSolverr(params: {
  serverUrl: string;
  timeout: number;
}): Promise<void> {
  const endpoint = new URL('v1', normalizeServerUrl(params.serverUrl));
  const payload: SessionsListPayload = {
    cmd: 'sessions.list',
  };
  const response = await customFetch(
    endpoint.href,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    params.timeout,
    1,
  );
  const body = await parseFlareSolverrResponse(response, endpoint);

  if (!response.ok || body.status !== 'ok') {
    throw new Error(body.message || 'FlareSolverr connection failed');
  }
}

export function buildCookieHeader(
  cookies: FlareSolverrCookie[],
  targetUrl?: string,
  defaultHost?: string,
): string {
  const target = targetUrl ? new URL(targetUrl) : null;
  const now = Date.now();

  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .filter((cookie) => isCookieNotExpired(cookie, now))
    .filter((cookie) => isCookieApplicable(cookie, target, defaultHost))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function normalizeServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) {
    throw new Error('FlareSolverr URL is required');
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function isChallengeSolveTimeout(message: string): boolean {
  return (
    message.includes('Error solving the challenge') &&
    message.includes('Timeout after')
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function parseFlareSolverrResponse(
  response: Response,
  endpoint: URL,
): Promise<FlareSolverrResponse> {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText) as FlareSolverrResponse;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response from FlareSolverr at ${endpoint.href} (HTTP ${response.status}, Content-Type: ${response.headers.get('content-type') || 'missing'})`,
      { cause: error },
    );
  }
}

function parseCookieHeader(cookieHeader: string): FlareSolverrCookie[] {
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) return null;

      return {
        name: entry.slice(0, separatorIndex),
        value: entry.slice(separatorIndex + 1),
      };
    })
    .filter((cookie): cookie is FlareSolverrCookie => cookie !== null);
}

function isCookieNotExpired(cookie: FlareSolverrCookie, now: number): boolean {
  if (cookie.expires === undefined || !Number.isFinite(cookie.expires)) {
    return true;
  }

  if (cookie.expires <= 0) {
    return true;
  }

  const expiresAt =
    cookie.expires > 10_000_000_000 ? cookie.expires : cookie.expires * 1000;
  return expiresAt > now;
}

function isCookieApplicable(
  cookie: FlareSolverrCookie,
  target: URL | null,
  defaultHost: string | undefined,
): boolean {
  if (!target) {
    return true;
  }

  if (cookie.secure && target.protocol !== 'https:') {
    return false;
  }

  const cookieDomain = cookie.domain?.replace(/^\./, '').toLowerCase();
  const targetHost = target.hostname.toLowerCase();
  const domain = cookieDomain || defaultHost?.toLowerCase();

  if (domain && !isDomainMatch(targetHost, domain)) {
    return false;
  }

  const cookiePath = cookie.path || '/';
  return isPathMatch(target.pathname, cookiePath);
}

function isDomainMatch(targetHost: string, cookieDomain: string): boolean {
  return targetHost === cookieDomain || targetHost.endsWith(`.${cookieDomain}`);
}

function isPathMatch(targetPath: string, cookiePath: string): boolean {
  if (targetPath === cookiePath) {
    return true;
  }

  if (!targetPath.startsWith(cookiePath)) {
    return false;
  }

  return cookiePath.endsWith('/') || targetPath[cookiePath.length] === '/';
}
