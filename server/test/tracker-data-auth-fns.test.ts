import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@server/shared/custom-fetch', () => ({
  customFetch: vi.fn(),
}));

import { authFns } from '@server/external/adapters/tracker-data/tracker-data.auth.fns';
import { customFetch } from '@server/shared/custom-fetch';

const baseArgs = {
  login: 'user',
  password: 'pass',
  baseUrl: 'https://kinozal.tv',
  authPath: '/takelogin.php',
};

describe('authFns.kinozal', () => {
  const mockedFetch = vi.mocked(customFetch);

  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cookie string when authentication succeeds', async () => {
    const response = {
      headers: {
        getSetCookie: vi.fn(() => ['sid=abc', 'uid=1']),
      },
    } as unknown as Response;

    mockedFetch.mockResolvedValueOnce(response);

    const cookies = await authFns.kinozal(
      baseArgs.login,
      baseArgs.password,
      baseArgs.baseUrl,
      baseArgs.authPath,
    );

    expect(cookies).toBe('sid=abc; uid=1');
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://kinozal.tv/takelogin.php',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: baseArgs.baseUrl,
        }),
        body: expect.any(URLSearchParams),
        redirect: 'manual',
      }),
    );

    const body = mockedFetch.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('username')).toBe(baseArgs.login);
    expect(body.get('password')).toBe(baseArgs.password);
  });

  it('throws descriptive error when fetch fails', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(
      authFns.kinozal(
        baseArgs.login,
        baseArgs.password,
        baseArgs.baseUrl,
        baseArgs.authPath,
      ),
    ).rejects.toThrow('Failed to authenticate with Error: network down');
  });

  it('throws when response has no cookies', async () => {
    const response = {
      headers: {
        getSetCookie: vi.fn(() => undefined),
      },
    } as unknown as Response;

    mockedFetch.mockResolvedValueOnce(response);

    await expect(
      authFns.kinozal(
        baseArgs.login,
        baseArgs.password,
        baseArgs.baseUrl,
        baseArgs.authPath,
      ),
    ).rejects.toThrow('No cookies found');
  });

  it('passes challenge cookies and user agent to the login request', async () => {
    const response = {
      headers: {
        getSetCookie: vi.fn(() => ['sid=abc']),
      },
    } as unknown as Response;

    mockedFetch.mockResolvedValueOnce(response);

    await authFns.kinozal(
      baseArgs.login,
      baseArgs.password,
      baseArgs.baseUrl,
      baseArgs.authPath,
      {
        cookies: 'cf_clearance=token',
        userAgent: 'Mozilla/5.0 FlareSolverr',
      },
    );

    expect(mockedFetch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'cf_clearance=token',
          'User-Agent': 'Mozilla/5.0 FlareSolverr',
        }),
      }),
    );
  });

  it('classifies a Cloudflare challenge response', async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response('<html>challenge</html>', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge' },
      }),
    );

    await expect(
      authFns.kinozal(
        baseArgs.login,
        baseArgs.password,
        baseArgs.baseUrl,
        baseArgs.authPath,
      ),
    ).rejects.toMatchObject({ name: 'CloudflareChallengeError' });
  });
});
