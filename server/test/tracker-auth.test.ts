import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth-fns module to control behavior
vi.mock('@server/external/adapters/tracker-data/tracker-data.auth.fns', () => {
  return {
    authFns: {
      kinozal: vi.fn(),
    },
  };
});

import { TrackerAuth } from '@server/external/adapters/tracker-data/tracker-data.auth';
import { authFns } from '@server/external/adapters/tracker-data/tracker-data.auth.fns';
import {
  TrackerAuthCookieCache,
  normalizeTrackerOrigin,
} from '@server/external/adapters/tracker-data/tracker-data.auth-cache';

describe('TrackerAuth.getCookies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cookies on successful authentication', async () => {
    const mocked = vi.mocked(authFns.kinozal);
    mocked.mockResolvedValueOnce('sid=abc; uid=1');

    const ta = new TrackerAuth({
      login: 'l',
      password: 'p',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });
    expect(ta.baseUrl).toBe('https://kinozal.tv');
    expect(ta.origin).toBe('https://kinozal.tv');
    const cookies = await ta.getCookies();
    expect(cookies).toBe('sid=abc; uid=1');
    expect(mocked).toHaveBeenCalledWith(
      'l',
      'p',
      'https://kinozal.tv',
      '/takelogin.php',
    );
  });

  it('throws with clear message on auth error', async () => {
    const mocked = vi.mocked(authFns.kinozal);
    mocked.mockRejectedValueOnce(new Error('network down'));

    const ta = new TrackerAuth({
      login: 'l',
      password: 'p',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });
    await expect(ta.getCookies()).rejects.toMatchObject({
      name: 'TrackerAuthError',
      kind: 'transport',
      retryable: true,
    });
  });

  it('classifies missing cookies as credential failure', async () => {
    const mocked = vi.mocked(authFns.kinozal);
    mocked.mockResolvedValueOnce('');

    const ta = new TrackerAuth({
      login: 'l',
      password: 'p',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });

    await expect(ta.getCookies()).rejects.toMatchObject({
      name: 'TrackerAuthError',
      kind: 'credentials',
      retryable: false,
    });
  });
});

describe('TrackerAuthCookieCache', () => {
  it('stores cookies and shares an in-flight authentication request', async () => {
    const cache = new TrackerAuthCookieCache();
    let resolveAuth: (cookies: string) => void = () => undefined;
    const authPromise = new Promise<string>((resolve) => {
      resolveAuth = resolve;
    });
    const create = vi.fn(() => authPromise);

    const first = cache.getOrCreate(
      'kinozal',
      'https://KINOZAL.TV/path',
      create,
    );
    const second = cache.getOrCreate('kinozal', 'https://kinozal.tv', create);
    resolveAuth('sid=shared');

    await expect(first).resolves.toEqual({
      cookies: 'sid=shared',
      source: 'auth',
    });
    await expect(second).resolves.toEqual({
      cookies: 'sid=shared',
      source: 'auth',
    });
    expect(create).toHaveBeenCalledTimes(1);

    await expect(
      cache.getOrCreate('kinozal', 'https://kinozal.tv/details.php', create),
    ).resolves.toEqual({ cookies: 'sid=shared', source: 'cache' });
    expect(
      cache.get('kinozal', normalizeTrackerOrigin('https://kinozal.tv')),
    ).toBe('sid=shared');
  });

  it('isolates cookies by tracker and origin', async () => {
    const cache = new TrackerAuthCookieCache();

    await cache.getOrCreate(
      'kinozal',
      'https://kinozal.tv',
      async () => 'sid=tv',
    );
    await cache.getOrCreate(
      'kinozal',
      'https://kinozal.me',
      async () => 'sid=me',
    );
    await cache.getOrCreate(
      'rutracker',
      'https://kinozal.tv',
      async () => 'sid=other',
    );

    expect(cache.get('kinozal', 'https://kinozal.tv')).toBe('sid=tv');
    expect(cache.get('kinozal', 'https://kinozal.me')).toBe('sid=me');
    expect(cache.get('rutracker', 'https://kinozal.tv')).toBe('sid=other');
  });

  it('removes a rejected request and allows authentication recovery', async () => {
    const cache = new TrackerAuthCookieCache();
    const create = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('sid=recovered');

    await expect(
      cache.getOrCreate('kinozal', 'https://kinozal.tv', create),
    ).rejects.toThrow('temporary failure');
    await expect(
      cache.getOrCreate('kinozal', 'https://kinozal.tv', create),
    ).resolves.toEqual({ cookies: 'sid=recovered', source: 'auth' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('invalidates only the cookie that is currently stored', async () => {
    const cache = new TrackerAuthCookieCache();
    await cache.getOrCreate(
      'kinozal',
      'https://kinozal.tv',
      async () => 'sid=old',
    );

    cache.invalidate('kinozal', 'https://kinozal.tv', 'sid=other');
    expect(cache.get('kinozal', 'https://kinozal.tv')).toBe('sid=old');

    cache.invalidate('kinozal', 'https://kinozal.tv', 'sid=old');
    expect(cache.get('kinozal', 'https://kinozal.tv')).toBeNull();
  });
});
