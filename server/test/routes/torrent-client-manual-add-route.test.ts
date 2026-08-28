import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono/tiny';
import type { TorrentClientAddRequest } from '@server/external/adapters/torrent-client';
import { torrentClientManualAddRoute } from '@server/routes/torrent-client.add';

const { addTorrentMock } = vi.hoisted(() => ({
  addTorrentMock: vi.fn<(request: TorrentClientAddRequest) => Promise<void>>(),
}));

vi.mock('@server/features/torrent-client/torrent-client.service', () => ({
  TorrentClientService: class {
    addTorrent = addTorrentMock;
  },
}));

const app = new Hono();
app.route('/torrent-client/add', torrentClientManualAddRoute);

beforeEach(() => {
  vi.clearAllMocks();
  addTorrentMock.mockResolvedValue(undefined);
});

describe('torrent client manual add route', () => {
  it('passes a magnet link and custom directory to the service', async () => {
    const form = new FormData();
    form.set('magnet', 'magnet:?xt=urn:btih:0123456789abcdef');
    form.set('downloadDir', '/media/downloads');

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(200);
    expect(addTorrentMock).toHaveBeenCalledWith({
      source: 'magnet',
      magnet: 'magnet:?xt=urn:btih:0123456789abcdef',
      downloadDir: '/media/downloads',
    });
  });

  it('reads torrent file bytes before passing them to the service', async () => {
    const form = new FormData();
    form.set(
      'torrentFile',
      new File([new Uint8Array([1, 2, 3])], 'linux.torrent', {
        type: 'application/x-bittorrent',
      }),
    );

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(200);
    const request = addTorrentMock.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      source: 'file',
      filename: 'linux.torrent',
    });
    expect(request?.source === 'file' ? [...request.content] : []).toEqual([
      1, 2, 3,
    ]);
  });

  it('rejects requests without exactly one source', async () => {
    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.status).toBe(400);
    expect(addTorrentMock).not.toHaveBeenCalled();
  });

  it('rejects a non-magnet URL', async () => {
    const form = new FormData();
    form.set('magnet', 'https://example.com/file.torrent');

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(400);
    expect(addTorrentMock).not.toHaveBeenCalled();
  });

  it('rejects requests containing both sources', async () => {
    const form = new FormData();
    form.set('magnet', 'magnet:?xt=urn:btih:0123456789abcdef');
    form.set(
      'torrentFile',
      new File(['torrent'], 'linux.torrent', {
        type: 'application/x-bittorrent',
      }),
    );

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(400);
    expect(addTorrentMock).not.toHaveBeenCalled();
  });

  it('rejects files without the torrent extension', async () => {
    const form = new FormData();
    form.set('torrentFile', new File(['not a torrent'], 'linux.txt'));

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(400);
    expect(addTorrentMock).not.toHaveBeenCalled();
  });

  it('returns a service error', async () => {
    addTorrentMock.mockRejectedValueOnce(new Error('Torrent client offline'));
    const form = new FormData();
    form.set('magnet', 'magnet:?xt=urn:btih:0123456789abcdef');

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });
    const body = (await response.json()) as {
      success: boolean;
      message?: string;
    };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      message: 'Torrent client offline',
    });
  });

  it('rejects files larger than 10 MB', async () => {
    const form = new FormData();
    form.set(
      'torrentFile',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.torrent'),
    );

    const response = await app.request('/torrent-client/add', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(400);
    expect(addTorrentMock).not.toHaveBeenCalled();
  });
});
