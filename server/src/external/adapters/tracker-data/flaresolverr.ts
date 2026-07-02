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
    const response = await customFetch(
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
    const body = (await response.json()) as FlareSolverrResponse;

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
  const body = (await response.json()) as FlareSolverrResponse;

  if (!response.ok || body.status !== 'ok') {
    throw new Error(body.message || 'FlareSolverr connection failed');
  }
}

export function buildCookieHeader(cookies: FlareSolverrCookie[]): string {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
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
