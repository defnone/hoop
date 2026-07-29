import { beforeEach, describe, expect, it, vi } from 'vitest';
import { torrentClientVerifyRoute } from '@server/routes/torrent-client.verify';

const verifyConnection = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock('@server/external/adapters/torrent-client', () => ({
  verifyTorrentClientConnection: verifyConnection,
}));

const connection = {
  type: 'qbittorrent' as const,
  url: 'http://localhost:8080',
  username: 'admin',
  password: 'password',
};

describe('torrentClientVerifyRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns detected client version', async () => {
    verifyConnection.mockResolvedValueOnce('5.1.0');
    const response = await torrentClientVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(connection),
    });
    const body = (await response.json()) as {
      success: boolean;
      data: { version: string };
    };

    expect(response.status).toBe(200);
    expect(verifyConnection).toHaveBeenCalledWith(connection);
    expect(body.data.version).toBe('5.1.0');
  });

  it('rejects invalid connection data', async () => {
    const response = await torrentClientVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...connection, url: 'localhost' }),
    });

    expect(response.status).toBe(400);
    expect(verifyConnection).not.toHaveBeenCalled();
  });

  it('returns client connection error', async () => {
    verifyConnection.mockRejectedValueOnce(new Error('Connection refused'));
    const response = await torrentClientVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(connection),
    });
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe('Connection refused');
  });
});
