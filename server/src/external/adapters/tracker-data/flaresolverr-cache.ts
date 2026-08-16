import {
  fetchWithFlareSolverr,
  type FlareSolverrCookie,
  type FlareSolverrSolution,
} from './flaresolverr';

export type FlareSolverrSession = {
  cookies: FlareSolverrCookie[];
  userAgent: string;
  expiresAt: number;
  origin: string;
  host: string;
};

export type FlareSolverrSessionResult = {
  session: FlareSolverrSession;
  response: string | null;
  status: number | null;
};

type ResolveFlareSolverrSessionParams = {
  tracker: string;
  serverUrl: string;
  targetUrl: string;
  timeout: number;
  cookies: string;
};

type SolvedFlareSolverrSession = {
  session: FlareSolverrSession;
  solution: FlareSolverrSolution;
};

const cachedSessions = new Map<string, FlareSolverrSession>();
const pendingSessions = new Map<string, Promise<SolvedFlareSolverrSession>>();

export async function resolveFlareSolverrSession(
  params: ResolveFlareSolverrSessionParams,
): Promise<FlareSolverrSessionResult> {
  const cacheKey = getFlareSolverrCacheKey(params.tracker, params.targetUrl);
  const cachedSession = getCachedFlareSolverrSession(
    params.tracker,
    params.targetUrl,
  );

  if (cachedSession) {
    return {
      session: cachedSession,
      response: null,
      status: null,
    };
  }

  const pendingSession = pendingSessions.get(cacheKey);
  if (pendingSession) {
    const solved = await pendingSession;
    return {
      session: solved.session,
      response: null,
      status: null,
    };
  }

  const solvePromise = solveAndCacheSession(params, cacheKey);
  pendingSessions.set(cacheKey, solvePromise);

  try {
    const solved = await solvePromise;
    return {
      session: solved.session,
      response: solved.solution.response,
      status: solved.solution.status,
    };
  } finally {
    if (pendingSessions.get(cacheKey) === solvePromise) {
      pendingSessions.delete(cacheKey);
    }
  }
}

export function getCachedFlareSolverrSession(
  tracker: string,
  targetUrl: string,
  now = Date.now(),
): FlareSolverrSession | null {
  const cacheKey = getFlareSolverrCacheKey(tracker, targetUrl);
  const session = cachedSessions.get(cacheKey);

  if (!session || !isFlareSolverrSessionUsable(session, targetUrl, now)) {
    if (session) {
      cachedSessions.delete(cacheKey);
    }
    return null;
  }

  return session;
}

export function getFlareSolverrCacheKey(
  tracker: string,
  targetUrl: string,
): string {
  return `${tracker}:${new URL(targetUrl).origin}`;
}

export function isFlareSolverrSessionUsable(
  session: FlareSolverrSession,
  targetUrl: string,
  now = Date.now(),
): boolean {
  const target = new URL(targetUrl);

  return (
    hasFlareSolverrSessionData(session) &&
    session.origin === target.origin &&
    session.expiresAt > now
  );
}

export function clearFlareSolverrCache(): void {
  cachedSessions.clear();
  pendingSessions.clear();
}

export function clearCachedFlareSolverrSession(
  tracker: string,
  targetUrl: string,
  expectedSession?: FlareSolverrSession,
): void {
  const cacheKey = getFlareSolverrCacheKey(tracker, targetUrl);
  const cachedSession = cachedSessions.get(cacheKey);

  if (!expectedSession || cachedSession === expectedSession) {
    cachedSessions.delete(cacheKey);
  }
}

async function solveAndCacheSession(
  params: ResolveFlareSolverrSessionParams,
  cacheKey: string,
): Promise<SolvedFlareSolverrSession> {
  const solution = await fetchWithFlareSolverr({
    serverUrl: params.serverUrl,
    targetUrl: params.targetUrl,
    timeout: params.timeout,
    cookies: params.cookies,
  });
  const session = createFlareSolverrSession(params.targetUrl, solution);

  if (isCacheableFlareSolverrSession(session)) {
    cachedSessions.set(cacheKey, session);
  }

  return { session, solution };
}

function createFlareSolverrSession(
  targetUrl: string,
  solution: FlareSolverrSolution,
): FlareSolverrSession {
  const target = new URL(targetUrl);
  const cookies = solution.cookies.map((cookie) => ({ ...cookie }));

  return {
    cookies,
    userAgent: solution.userAgent,
    expiresAt: getSessionExpiration(cookies),
    origin: target.origin,
    host: target.hostname,
  };
}

function isCacheableFlareSolverrSession(session: FlareSolverrSession): boolean {
  return hasFlareSolverrSessionData(session);
}

function hasFlareSolverrSessionData(session: FlareSolverrSession): boolean {
  return session.cookies.length > 0 && Boolean(session.userAgent);
}

function getSessionExpiration(cookies: FlareSolverrCookie[]): number {
  const expirations = cookies
    .map((cookie) => normalizeCookieExpiration(cookie.expires))
    .filter((expiration): expiration is number => expiration !== null);

  return expirations.length > 0
    ? Math.min(...expirations)
    : Number.POSITIVE_INFINITY;
}

function normalizeCookieExpiration(expires: number | undefined): number | null {
  if (expires === undefined || !Number.isFinite(expires) || expires <= 0) {
    return null;
  }

  return expires > 10_000_000_000 ? expires : expires * 1000;
}
