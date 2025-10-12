import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { jackettSearchRoute } from '@server/routes/jackett.search';
import { jackettVerifyRoute } from '@server/routes/jackett.verify';

type JackettSettings = {
  jackettUrl: string | null;
  jackettApiKey: string | null;
  kinozalUsername: string | null;
  kinozalPassword: string | null;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
  code?: number;
};

const { getSettingsMock, fetchMock } = vi.hoisted(() => {
  const getSettingsMock = vi.fn<() => Promise<JackettSettings | null>>();
  const fetchMock = vi.fn<typeof fetch>();
  return { getSettingsMock, fetchMock } as const;
});

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings() {
      return await getSettingsMock();
    }
  },
}));

beforeEach(() => {
  getSettingsMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jackettSearchRoute', () => {
  it('returns error when query is missing', async () => {
    const response = await jackettSearchRoute.request('/');
    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('Query is required');
  });

  it('returns error when Jackett is not configured', async () => {
    getSettingsMock.mockResolvedValueOnce({
      jackettUrl: null,
      jackettApiKey: null,
      kinozalUsername: null,
      kinozalPassword: null,
    });

    const response = await jackettSearchRoute.request('/?query=test');
    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('Jackett is not configured');
  });

  it('returns search results', async () => {
    getSettingsMock.mockResolvedValueOnce({
      jackettUrl: 'http://jackett.test',
      jackettApiKey: 'key',
      kinozalUsername: 'user',
      kinozalPassword: 'pass',
    });

    const rutrackerPayload = {
      Results: [
        {
          Tracker: 'rutracker',
          TrackerId: '1',
          Title: 'Show',
          Details: 'link',
          PublishDate: '2024-01-01',
          Size: 100,
          Seeders: 10,
          Peers: 5,
          Grabs: 1,
        },
      ],
    };

    const emptyPayload = {
      Results: [],
    };

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(rutrackerPayload), {
          status: 200,
          statusText: 'OK',
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyPayload), {
          status: 200,
          statusText: 'OK',
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyPayload), {
          status: 200,
          statusText: 'OK',
        })
      );

    const response = await jackettSearchRoute.request(
      '/?query=show&tracker=all&season=1&category=5000'
    );
    const body = (await response.json()) as ApiResponse<
      Array<{ Tracker: string }>
    >;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const data = body.data ?? [];
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]?.Tracker).toBe('rutracker');
  });

  it('returns error when Jackett responds with error', async () => {
    getSettingsMock.mockResolvedValueOnce({
      jackettUrl: 'http://jackett.test',
      jackettApiKey: 'key',
      kinozalUsername: 'user',
      kinozalPassword: 'pass',
    });

    fetchMock.mockResolvedValueOnce(
      new Response('error', {
        status: 502,
        statusText: 'Bad Gateway',
      })
    );

    const response = await jackettSearchRoute.request('/?query=fail');
    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(502);
    expect(body.message).toBe('Jackett request failed: 502 Bad Gateway');
  });
});

describe('jackettVerifyRoute /connection', () => {
  it('returns success when Jackett is reachable', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('ok', { status: 200, statusText: 'OK' })
    );

    const response = await jackettVerifyRoute.request('/connection', {
      method: 'POST',
      body: JSON.stringify({ jackettUrl: 'http://jackett.test' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<{ status: number }>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe(200);
  });

  it('returns 502 when Jackett responds with 5xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('err', { status: 503, statusText: 'Service Unavailable' })
    );

    const response = await jackettVerifyRoute.request('/connection', {
      method: 'POST',
      body: JSON.stringify({ jackettUrl: 'http://jackett.test' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(502);
    expect(body.message).toBe('Jackett responded with 503 Service Unavailable');
  });

  it('returns 500 on network error', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    const response = await jackettVerifyRoute.request('/connection', {
      method: 'POST',
      body: JSON.stringify({ jackettUrl: 'http://jackett.test' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(500);
    expect(body.message).toBe(
      'Failed to fetch http://jackett.test/ after 3 attempts: Error: network'
    );
  });
});

describe('jackettVerifyRoute /api-key', () => {
  const payload = {
    jackettUrl: 'http://jackett.test',
    jackettApiKey: 'key',
  };

  it('validates a valid key', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('ok', { status: 200, statusText: 'OK' })
    );

    const response = await jackettVerifyRoute.request('/api-key', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<{ status: number }>;

    expect(response.status).toBe(200);
    expect(body.data?.status).toBe(200);
  });

  it('returns 401 for invalid key', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    const response = await jackettVerifyRoute.request('/api-key', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(401);
    expect(body.message).toBe('Provided Jackett API Key is invalid');
  });

  it('returns 502 for unexpected status', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('bad', { status: 418, statusText: "I'm a teapot" })
    );

    const response = await jackettVerifyRoute.request('/api-key', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(502);
    expect(body.message).toBe("Jackett responded with 418 I'm a teapot");
  });

  it('returns 500 on network error', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    const response = await jackettVerifyRoute.request('/api-key', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(500);
    expect(body.message).toBe(
      'Failed to validate Jackett API Key: Failed to fetch http://jackett.test/api/v2.0/indexers/all/results/?apikey=key&Query=ping&Category=5000 after 3 attempts: Error: network'
    );
  });
});
