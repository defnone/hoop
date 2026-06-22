import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCookieHeader,
  fetchWithFlareSolverr,
} from '@server/external/adapters/tracker-data/flaresolverr';
import { customFetch } from '@server/shared/custom-fetch';

vi.mock('@server/shared/custom-fetch', () => ({
  customFetch: vi.fn(),
}));

describe('FlareSolverr client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts request.get payload with parsed cookies', async () => {
    vi.mocked(customFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          solution: {
            status: 200,
            response: '<html></html>',
            cookies: [{ name: 'cf_clearance', value: 'token' }],
            userAgent: 'Mozilla/5.0',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const solution = await fetchWithFlareSolverr({
      serverUrl: 'http://localhost:8191/',
      targetUrl: 'https://example.com/topic',
      timeout: 10_000,
      cookies: 'sid=abc; broken; pref=a=b',
    });
    const requestOptions = vi.mocked(customFetch).mock.calls[0]?.[1];
    const body =
      typeof requestOptions?.body === 'string'
        ? (JSON.parse(requestOptions.body) as {
            cmd: string;
            url: string;
            maxTimeout: number;
            cookies: Array<{ name: string; value: string }>;
          })
        : null;

    expect(solution.userAgent).toBe('Mozilla/5.0');
    expect(vi.mocked(customFetch)).toHaveBeenCalledWith(
      'http://localhost:8191/v1',
      expect.objectContaining({ method: 'POST' }),
      15_000,
      1,
    );
    expect(body).toEqual({
      cmd: 'request.get',
      url: 'https://example.com/topic',
      maxTimeout: 10_000,
      cookies: [
        { name: 'sid', value: 'abc' },
        { name: 'pref', value: 'a=b' },
      ],
    });
  });

  it('throws when FlareSolverr returns a failed status', async () => {
    vi.mocked(customFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'error', message: 'failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      fetchWithFlareSolverr({
        serverUrl: 'http://localhost:8191',
        targetUrl: 'https://example.com/topic',
        timeout: 10_000,
        cookies: '',
      }),
    ).rejects.toThrow('failed');
  });

  it('throws when response body is empty', async () => {
    vi.mocked(customFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          solution: {
            status: 200,
            response: '',
            cookies: [],
            userAgent: 'Mozilla/5.0',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(
      fetchWithFlareSolverr({
        serverUrl: 'http://localhost:8191',
        targetUrl: 'https://example.com/topic',
        timeout: 10_000,
        cookies: '',
      }),
    ).rejects.toThrow('FlareSolverr response body is empty');
  });

  it('builds cookie header from valid cookies only', () => {
    expect(
      buildCookieHeader([
        { name: 'sid', value: 'abc' },
        { name: '', value: 'missing-name' },
        { name: 'empty', value: '' },
        { name: 'cf_clearance', value: 'token' },
      ]),
    ).toBe('sid=abc; cf_clearance=token');
  });
});
