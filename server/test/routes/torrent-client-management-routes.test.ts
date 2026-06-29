import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono/tiny';
import { TorrentState, type NormalizedTorrent } from '@ctrl/shared-torrent';
import type {
  TorrentClientAction,
  TorrentClientItemDto,
} from '@server/external/adapters/transmission';
import { torrentClientRoute } from '@server/routes/torrent-client';
import { torrentClientActionRoute } from '@server/routes/torrent-client.$id.action';
import { torrentClientRemoveRoute } from '@server/routes/torrent-client.$id.remove';
import { statusStorage } from '@server/workers/download-worker';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const {
  getAllNormalizedMock,
  controlClientTorrentMock,
  removeClientTorrentMock,
  transmissionCtor,
} = vi.hoisted(() => {
  const getAllNormalizedMock = vi.fn<() => Promise<TorrentClientItemDto[]>>();
  const controlClientTorrentMock =
    vi.fn<(id: string, action: TorrentClientAction) => Promise<void>>();
  const removeClientTorrentMock =
    vi.fn<(id: string, deleteData: boolean) => Promise<number | null>>();
  const transmissionCtor = vi.fn(function transmissionCtor() {
    return {
      getAllNormalized: getAllNormalizedMock,
      controlClientTorrent: controlClientTorrentMock,
      removeClientTorrent: removeClientTorrentMock,
    };
  });

  return {
    getAllNormalizedMock,
    controlClientTorrentMock,
    removeClientTorrentMock,
    transmissionCtor,
  } as const;
});

const { statusStorageMock } = vi.hoisted(() => ({
  statusStorageMock: new Map<number, NormalizedTorrent | undefined>(),
}));

vi.mock('@server/external/adapters/transmission', () => ({
  TransmissionAdapter: transmissionCtor,
  torrentClientActions: [
    'pause',
    'resume',
    'verify',
    'reannounce',
    'queue-top',
    'queue-up',
    'queue-down',
    'queue-bottom',
  ],
}));

vi.mock('@server/workers/download-worker', () => ({
  statusStorage: statusStorageMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  statusStorage.clear();
});

describe('torrent client management routes', () => {
  it('returns all normalized Transmission torrents', async () => {
    const torrent = createTorrent();
    getAllNormalizedMock.mockResolvedValueOnce([torrent]);

    const response = await torrentClientRoute.request('/');
    const body = (await response.json()) as ApiResponse<TorrentClientItemDto[]>;

    expect(response.status).toBe(200);
    expect(transmissionCtor).toHaveBeenCalledWith({ id: 0 });
    expect(body.data).toEqual([torrent]);
  });

  it('returns a client error when Transmission listing fails', async () => {
    getAllNormalizedMock.mockRejectedValueOnce(new Error('offline'));

    const response = await torrentClientRoute.request('/');
    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('offline');
  });

  it('runs a validated Transmission action', async () => {
    controlClientTorrentMock.mockResolvedValueOnce(undefined);
    const app = mountRoute(
      '/torrent-client/:id/action',
      torrentClientActionRoute,
    );

    const response = await app.request('/torrent-client/hash/action', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    });

    expect(response.status).toBe(200);
    expect(controlClientTorrentMock).toHaveBeenCalledWith('hash', 'pause');
  });

  it('rejects an unsupported Transmission action', async () => {
    const app = mountRoute(
      '/torrent-client/:id/action',
      torrentClientActionRoute,
    );

    const response = await app.request('/torrent-client/hash/action', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unsupported' }),
    });

    expect(response.status).toBe(400);
    expect(controlClientTorrentMock).not.toHaveBeenCalled();
  });

  it('removes a torrent, keeps data, and clears cached hoop status', async () => {
    removeClientTorrentMock.mockResolvedValueOnce(17);
    statusStorage.set(17, createNormalizedTorrent());
    const app = mountRoute(
      '/torrent-client/:id/remove',
      torrentClientRemoveRoute,
    );

    const response = await app.request(
      '/torrent-client/hash/remove?deleteData=false',
      { method: 'DELETE' },
    );

    expect(response.status).toBe(200);
    expect(removeClientTorrentMock).toHaveBeenCalledWith('hash', false);
    expect(statusStorage.has(17)).toBe(false);
  });

  it('passes the destructive data removal flag', async () => {
    removeClientTorrentMock.mockResolvedValueOnce(null);
    const app = mountRoute(
      '/torrent-client/:id/remove',
      torrentClientRemoveRoute,
    );

    const response = await app.request(
      '/torrent-client/hash/remove?deleteData=true',
      { method: 'DELETE' },
    );

    const body = (await response.json()) as ApiResponse<null>;
    expect(response.status).toBe(200);
    expect(removeClientTorrentMock).toHaveBeenCalledWith('hash', true);
    expect(body.message).toBe('Torrent and data removed from Transmission');
  });
});

function mountRoute(path: string, route: Hono): Hono {
  const app = new Hono();
  app.route(path, route);
  return app;
}

function createTorrent(): TorrentClientItemDto {
  return {
    id: 'hash',
    name: 'Ubuntu.iso',
    progress: 0.5,
    isCompleted: false,
    ratio: 0.25,
    dateAdded: '2026-06-27T00:00:00.000Z',
    dateCompleted: null,
    savePath: '/downloads',
    label: null,
    tags: [],
    state: TorrentState.downloading,
    stateMessage: 'Downloading',
    uploadSpeed: 100,
    downloadSpeed: 200,
    eta: 60,
    queuePosition: 0,
    connectedSeeds: 1,
    connectedPeers: 2,
    totalSeeds: 3,
    totalPeers: 4,
    totalSelected: 1000,
    totalSize: 1000,
    totalUploaded: 50,
    totalDownloaded: 500,
  };
}

function createNormalizedTorrent(): NormalizedTorrent {
  return {
    ...createTorrent(),
    dateCompleted: '',
    label: '',
    raw: { files: [] },
  };
}
