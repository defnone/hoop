import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flaresolverrVerifyRoute } from '@server/routes/flaresolverr.verify';
import { customFetch } from '@server/shared/custom-fetch';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

vi.mock('@server/shared/custom-fetch', () => ({
  customFetch: vi.fn(),
}));

vi.mock('@server/lib/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('flaresolverrVerifyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies FlareSolverr availability', async () => {
    vi.mocked(customFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', sessions: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await flaresolverrVerifyRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({
        flaresolverrUrl: 'http://localhost:8191',
        timeoutSeconds: 60,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });
    const body = (await response.json()) as ApiResponse<null>;
    const requestOptions = vi.mocked(customFetch).mock.calls[0]?.[1];
    const requestBody =
      typeof requestOptions?.body === 'string'
        ? (JSON.parse(requestOptions.body) as { cmd: string })
        : null;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(requestBody).toEqual({ cmd: 'sessions.list' });
    expect(vi.mocked(customFetch)).toHaveBeenCalledWith(
      'http://localhost:8191/v1',
      expect.objectContaining({ method: 'POST' }),
      60_000,
      1,
    );
  });

  it('returns an error when FlareSolverr is unavailable', async () => {
    vi.mocked(customFetch).mockRejectedValueOnce(new Error('offline'));

    const response = await flaresolverrVerifyRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({
        flaresolverrUrl: 'http://localhost:8191',
        timeoutSeconds: 5,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });
    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toContain('offline');
  });
});
