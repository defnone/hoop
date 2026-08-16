import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCookieHeader,
  type FlareSolverrCookie,
} from '@server/external/adapters/tracker-data/flaresolverr';
import {
  clearCachedFlareSolverrSession,
  clearFlareSolverrCache,
  getCachedFlareSolverrSession,
  isFlareSolverrSessionUsable,
  resolveFlareSolverrSession,
  type FlareSolverrSession,
} from '@server/external/adapters/tracker-data/flaresolverr-cache';
import { customFetch } from '@server/shared/custom-fetch';

vi.mock('@server/shared/custom-fetch', () => ({
  customFetch: vi.fn(),
}));

const serverUrl = 'http://localhost:8191';
const targetUrl = 'https://example.com/forum/topic';

describe('FlareSolverr session cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFlareSolverrCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearFlareSolverrCache();
  });

  it('rejects sessions without cookies or exact user agent', () => {
    const session: FlareSolverrSession = {
      cookies: [],
      userAgent: '',
      expiresAt: Number.POSITIVE_INFINITY,
      origin: 'https://example.com',
      host: 'example.com',
    };

    expect(isFlareSolverrSessionUsable(session, targetUrl)).toBe(false);

    session.userAgent = 'Mozilla/5.0';
    expect(isFlareSolverrSessionUsable(session, targetUrl)).toBe(false);

    session.cookies = [{ name: 'cf_clearance', value: 'token' }];
    expect(isFlareSolverrSessionUsable(session, targetUrl)).toBe(true);
  });

  it('reuses unexpired cookies and exact user agent', async () => {
    const expires = Math.floor(Date.now() / 1000) + 3_600;
    vi.mocked(customFetch).mockResolvedValueOnce(
      flaresolverrResponse({
        value: 'first-token',
        expires,
        userAgent: 'Mozilla/5.0 exact-agent',
      }),
    );

    const first = await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });
    const second = await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl: 'https://example.com/forum/another-topic',
      timeout: 10_000,
      cookies: '',
    });

    expect(vi.mocked(customFetch)).toHaveBeenCalledTimes(1);
    expect(first.response).toBe('<html>solved</html>');
    expect(second.response).toBeNull();
    expect(second.session.userAgent).toBe('Mozilla/5.0 exact-agent');
    expect(second.session.cookies[0]?.value).toBe('first-token');
  });

  it('removes expired entry and solves again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
    const firstExpires = Math.floor(Date.now() / 1000) + 60;
    const secondExpires = firstExpires + 3_600;

    vi.mocked(customFetch)
      .mockResolvedValueOnce(
        flaresolverrResponse({
          value: 'expired-token',
          expires: firstExpires,
          userAgent: 'Mozilla/5.0 first-agent',
        }),
      )
      .mockResolvedValueOnce(
        flaresolverrResponse({
          value: 'fresh-token',
          expires: secondExpires,
          userAgent: 'Mozilla/5.0 second-agent',
        }),
      );

    await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });

    vi.advanceTimersByTime(61_000);

    const result = await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });

    expect(vi.mocked(customFetch)).toHaveBeenCalledTimes(2);
    expect(result.response).toBe('<html>solved</html>');
    expect(result.session.cookies[0]?.value).toBe('fresh-token');
  });

  it('shares one solve between concurrent challenges', async () => {
    let resolveResponse = (_response: Response): void => {
      throw new Error('Pending FlareSolverr response resolver is missing');
    };
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.mocked(customFetch).mockReturnValueOnce(pendingResponse);

    const firstPromise = resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl: 'https://example.com/forum/first',
      timeout: 10_000,
      cookies: '',
    });
    const secondPromise = resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl: 'https://example.com/forum/second',
      timeout: 10_000,
      cookies: '',
    });

    await Promise.resolve();
    expect(vi.mocked(customFetch)).toHaveBeenCalledTimes(1);

    resolveResponse(
      flaresolverrResponse({
        value: 'shared-token',
        expires: Math.floor(Date.now() / 1000) + 3_600,
        userAgent: 'Mozilla/5.0 shared-agent',
      }),
    );

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.response).toBe('<html>solved</html>');
    expect(second.response).toBeNull();
    expect(second.session.cookies[0]?.value).toBe('shared-token');
  });

  it('does not retain rejected solve promise', async () => {
    vi.mocked(customFetch)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        flaresolverrResponse({
          value: 'recovered-token',
          expires: Math.floor(Date.now() / 1000) + 3_600,
          userAgent: 'Mozilla/5.0 recovered-agent',
        }),
      );

    await expect(
      resolveFlareSolverrSession({
        tracker: 'rutracker',
        serverUrl,
        targetUrl,
        timeout: 10_000,
        cookies: '',
      }),
    ).rejects.toThrow('temporary failure');

    const result = await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });

    expect(vi.mocked(customFetch)).toHaveBeenCalledTimes(4);
    expect(result.session.cookies[0]?.value).toBe('recovered-token');
  });

  it('keeps fresh cache when stale caller invalidates after fresh solve', async () => {
    const staleExpires = Math.floor(Date.now() / 1000) + 3_600;
    const freshExpires = staleExpires + 3_600;
    vi.mocked(customFetch).mockResolvedValueOnce(
      flaresolverrResponse({
        value: 'stale-token',
        expires: staleExpires,
        userAgent: 'Mozilla/5.0 stale-agent',
      }),
    );

    await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });

    const staleSession = getCachedFlareSolverrSession('rutracker', targetUrl);
    if (!staleSession) {
      throw new Error('Stale session was not cached');
    }

    clearCachedFlareSolverrSession('rutracker', targetUrl, staleSession);

    vi.mocked(customFetch).mockResolvedValueOnce(
      flaresolverrResponse({
        value: 'fresh-token',
        expires: freshExpires,
        userAgent: 'Mozilla/5.0 fresh-agent',
      }),
    );
    const freshResult = await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });

    clearCachedFlareSolverrSession('rutracker', targetUrl, staleSession);

    const reusedResult = await resolveFlareSolverrSession({
      tracker: 'rutracker',
      serverUrl,
      targetUrl,
      timeout: 10_000,
      cookies: '',
    });

    expect(freshResult.session.cookies[0]?.value).toBe('fresh-token');
    expect(reusedResult.response).toBeNull();
    expect(reusedResult.session.cookies[0]?.value).toBe('fresh-token');
    expect(vi.mocked(customFetch)).toHaveBeenCalledTimes(2);
  });

  it('keeps cookie domain, path, secure, and expiry semantics', () => {
    const cookies: FlareSolverrCookie[] = [
      {
        name: 'domain-cookie',
        value: 'yes',
        domain: '.example.com',
        path: '/forum',
        expires: Math.floor(Date.now() / 1000) + 3_600,
      },
      {
        name: 'wrong-path',
        value: 'no',
        domain: 'example.com',
        path: '/private',
      },
      {
        name: 'secure-cookie',
        value: 'yes',
        domain: 'example.com',
        secure: true,
      },
      {
        name: 'expired-cookie',
        value: 'no',
        domain: 'example.com',
        expires: Math.floor(Date.now() / 1000) - 1,
      },
    ];

    expect(
      buildCookieHeader(
        cookies,
        'https://sub.example.com/forum/topic',
        'example.com',
      ),
    ).toBe('domain-cookie=yes; secure-cookie=yes');
    expect(
      buildCookieHeader(
        cookies,
        'http://example.com/forum/topic',
        'example.com',
      ),
    ).toBe('domain-cookie=yes');
  });
});

function flaresolverrResponse(params: {
  value: string;
  expires: number;
  userAgent: string;
}): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      solution: {
        status: 200,
        response: '<html>solved</html>',
        cookies: [
          {
            name: 'cf_clearance',
            value: params.value,
            domain: '.example.com',
            path: '/',
            expires: params.expires,
            secure: true,
          },
        ],
        userAgent: params.userAgent,
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}
