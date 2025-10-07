import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono/tiny';
import { torrentClientAddRoute } from '@server/routes/torrent-client.$id.add';
import { torrentClientDeleteRoute } from '@server/routes/torrent-client.$id.delete';
import { statusStorage } from '@server/workers/download-worker';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import { TorrentState } from '@ctrl/shared-torrent';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const { addMock, removeMock, transmissionCtor } = vi.hoisted(() => {
  const addMock = vi.fn<() => Promise<void>>();
  const removeMock = vi.fn<(withData: boolean) => Promise<void>>();
  const transmissionCtor = vi.fn((params: { id: number }) => ({
    add: addMock,
    remove: removeMock,
    ...params,
  }));
  return { addMock, removeMock, transmissionCtor } as const;
});

const { statusStorage: statusStorageMock } = vi.hoisted(() => ({
  statusStorage: new Map<number, NormalizedTorrent | undefined>(),
}));

vi.mock('@server/workers/download-worker', () => ({
  statusStorage: statusStorageMock,
}));

vi.mock('@server/external/adapters/transmission', () => ({
  TransmissionAdapter: transmissionCtor,
}));

function createStatus(): NormalizedTorrent {
  return {
    id: 'abc',
    name: 'Torrent',
    progress: 10,
    isCompleted: false,
    ratio: 0,
    dateAdded: new Date().toISOString(),
    savePath: '/downloads',
    state: TorrentState.downloading,
    stateMessage: 'downloading',
    uploadSpeed: 0,
    downloadSpeed: 0,
    eta: 0,
    queuePosition: 0,
    connectedSeeds: 0,
    connectedPeers: 0,
    totalSeeds: 0,
    totalPeers: 0,
    totalSelected: 0,
    totalSize: 0,
    totalUploaded: 0,
    totalDownloaded: 0,
    raw: { files: [] },
  } satisfies NormalizedTorrent;
}

function mountRoute(path: string, route: Hono) {
  const app = new Hono();
  app.route(path, route);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  statusStorage.clear();
});

describe('torrent-client routes', () => {
  it('adds torrent to client', async () => {
    addMock.mockResolvedValueOnce(undefined);
    const app = mountRoute('/torrent-client/:id/add', torrentClientAddRoute);

    const response = await app.request('/torrent-client/9/add', {
      method: 'POST',
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(200);
    expect(transmissionCtor).toHaveBeenCalledWith({ id: 9 });
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(body.message).toBe('Torrent added');
  });

  it('returns error when add fails', async () => {
    addMock.mockRejectedValueOnce(new Error('add failed'));
    const app = mountRoute('/torrent-client/:id/add', torrentClientAddRoute);

    const response = await app.request('/torrent-client/9/add', {
      method: 'POST',
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('add failed');
  });

  it('removes torrent from client and clears status', async () => {
    removeMock.mockResolvedValueOnce(undefined);
    statusStorage.set(9, createStatus());
    const app = mountRoute('/torrent-client/:id/delete', torrentClientDeleteRoute);

    const response = await app.request('/torrent-client/9/delete', {
      method: 'DELETE',
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith(true);
    expect(statusStorage.has(9)).toBe(false);
    expect(body.message).toBe('Torrent deleted from client');
  });

  it('returns error when removal fails', async () => {
    removeMock.mockRejectedValueOnce(new Error('remove failed'));
    statusStorage.set(9, createStatus());
    const app = mountRoute('/torrent-client/:id/delete', torrentClientDeleteRoute);

    const response = await app.request('/torrent-client/9/delete', {
      method: 'DELETE',
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(statusStorage.has(9)).toBe(true);
    expect(body.message).toBe('remove failed');
  });
});
