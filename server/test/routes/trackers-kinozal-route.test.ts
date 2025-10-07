import { describe, it, expect, beforeEach, vi } from 'vitest';
import { trackersKinozalVerifyRoute } from '@server/routes/trackers.kinozal.verify';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const { getCookiesMock, trackerAuthCtor, trackersConfMock } = vi.hoisted(() => {
  const getCookiesMock = vi.fn<() => Promise<string>>();
  const trackerAuthCtor = vi.fn(
    (params: { login: string; password: string; baseUrl: string; tracker: string }) => ({
      getCookies: getCookiesMock,
      ...params,
    })
  );
  const trackersConfMock: { kinozal: { urls: string[] } | undefined } = {
    kinozal: { urls: ['kinozal.test'] },
  };
  return { getCookiesMock, trackerAuthCtor, trackersConfMock } as const;
});

const { normalizeBaseUrl } = vi.hoisted(() => ({
  normalizeBaseUrl: (host: string) =>
    host.startsWith('http') ? host : `https://${host}`,
}));

vi.mock('@server/lib/utils', () => ({
  normalizeBaseUrl,
  usersCountStorage: new Map<string, number>(),
}));

vi.mock('@server/external/adapters/tracker-data/tracker-data.auth', () => ({
  TrackerAuth: trackerAuthCtor,
}));

vi.mock('@server/shared/trackers-conf', () => ({
  trackersConf: trackersConfMock,
}));

beforeEach(() => {
  getCookiesMock.mockReset();
  trackerAuthCtor.mockClear();
  trackersConfMock.kinozal = { urls: ['kinozal.test'] };
});

describe('trackersKinozalVerifyRoute', () => {
  it('validates credentials successfully', async () => {
    getCookiesMock.mockResolvedValueOnce('cookies');

    const response = await trackersKinozalVerifyRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({ username: 'user', password: 'pass' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<{ valid: boolean }>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.valid).toBe(true);
    expect(trackerAuthCtor).toHaveBeenCalledWith({
      login: 'user',
      password: 'pass',
      baseUrl: 'https://kinozal.test',
      tracker: 'kinozal',
    });
  });

  it('returns error when configuration is missing', async () => {
    trackersConfMock.kinozal = undefined;

    const response = await trackersKinozalVerifyRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({ username: 'user', password: 'pass' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('Kinozal is not configured');
  });

  it('returns error when all auth attempts fail', async () => {
    trackersConfMock.kinozal = { urls: ['kinozal.test', 'kinozal2.test'] };
    getCookiesMock.mockRejectedValue(new Error('auth failed'));

    const response = await trackersKinozalVerifyRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({ username: 'user', password: 'pass' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(getCookiesMock).toHaveBeenCalledTimes(2);
    expect(body.message).toBe('auth failed');
  });
});
