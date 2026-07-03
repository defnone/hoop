import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { customFetch } from '@server/shared/custom-fetch';

const { fetchMock, loggerErrorMock } = vi.hoisted(() => ({
  fetchMock: vi.fn<typeof fetch>(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@server/lib/logger', () => ({
  default: {
    error: loggerErrorMock,
  },
}));

describe('customFetch URL redaction', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    loggerErrorMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses original URL for request and redacted URL for logs and errors', async () => {
    const requestUrl =
      'https://jackett.test/api?apikey=jackett-secret&Query=show';
    fetchMock.mockRejectedValueOnce(new Error('network'));

    await expect(customFetch(requestUrl, {}, 10, 1)).rejects.toThrowError(
      'https://jackett.test/api?apikey=[REDACTED]&Query=show',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      requestUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(loggerErrorMock).toHaveBeenCalledOnce();
    expect(String(loggerErrorMock.mock.calls[0]?.[0])).not.toContain(
      'jackett-secret',
    );
  });

  it('redacts sensitive URL values included in fetch error message', async () => {
    fetchMock.mockRejectedValueOnce(
      new Error('upstream failed?apikey=error-secret'),
    );

    await expect(
      customFetch('https://jackett.test/api', {}, 10, 1),
    ).rejects.not.toThrow('error-secret');
    expect(String(loggerErrorMock.mock.calls[0]?.[0])).not.toContain(
      'error-secret',
    );
  });
});
