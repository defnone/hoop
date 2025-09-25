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
    const cookies = await ta.getCookies();
    expect(cookies).toBe('sid=abc; uid=1');
    expect(mocked).toHaveBeenCalledWith(
      'l',
      'p',
      'https://kinozal.tv',
      '/takelogin.php'
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
    await expect(ta.getCookies()).rejects.toThrow(
      /Failed to authenticate kinozal with/
    );
  });
});
