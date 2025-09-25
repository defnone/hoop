import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono/tiny';
import type {
  TorrentItemDto,
  PagedResult,
  TorrentItemParams,
} from '@server/features/torrent-item/torrent-item.types';
import { torrentsRoute } from '@server/routes/torrents';
import { torrentsStatusRoute } from '@server/routes/torrents.status';
import { torrentsAddRoute } from '@server/routes/torrents.add';
import { torrentsDeleteRoute } from '@server/routes/torrents.$id.delete';
import { torrentsSaveRoute } from '@server/routes/torrents.save';
import { deleteFileRoute } from '@server/routes/files.$id.delete';
import { statusStorage } from '@server/workers/download-worker';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import { TorrentState } from '@ctrl/shared-torrent';

const {
  getAllMock,
  addOrUpdateMock,
  markAsTrackedAllMock,
  markAsDownloadRequestedMock,
  deleteMock,
  updateTrackedEpisodesMock,
  deleteFileEpisodeMock,
  torrentItemCtorSpy,
} = vi.hoisted(() => {
  const getAllMock = vi.fn<
    [number, number],
    Promise<PagedResult<TorrentItemDto>>
  >();
  const addOrUpdateMock = vi.fn<[], Promise<TorrentItemDto | null>>();
  const markAsTrackedAllMock = vi.fn<[], Promise<void>>();
  const markAsDownloadRequestedMock = vi.fn<[], Promise<void>>();
  const deleteMock = vi.fn<[boolean], Promise<void>>();
  const updateTrackedEpisodesMock = vi.fn<[number[]], Promise<void>>();
  const deleteFileEpisodeMock = vi.fn<[string], Promise<void>>();
  const torrentItemCtorSpy = vi.fn((params: TorrentItemParams) => ({
    getAll: getAllMock,
    addOrUpdate: addOrUpdateMock,
    markAsTrackedAll: markAsTrackedAllMock,
    markAsDownloadRequested: markAsDownloadRequestedMock,
    delete: deleteMock,
    updateTrackedEpisodes: updateTrackedEpisodesMock,
    deleteFileEpisode: deleteFileEpisodeMock,
    ...params,
  }));
  return {
    getAllMock,
    addOrUpdateMock,
    markAsTrackedAllMock,
    markAsDownloadRequestedMock,
    deleteMock,
    updateTrackedEpisodesMock,
    deleteFileEpisodeMock,
    torrentItemCtorSpy,
  } as const;
});

const { statusStorage: statusStorageMock } = vi.hoisted(() => ({
  statusStorage: new Map<number, NormalizedTorrent | undefined>(),
}));

vi.mock('@server/workers/download-worker', () => ({
  statusStorage: statusStorageMock,
}));

vi.mock('@server/features/torrent-item/torrent-item.service', () => ({
  TorrentItem: torrentItemCtorSpy,
}));

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

function createTorrentDto(
  override: Partial<TorrentItemDto> = {}
): TorrentItemDto {
  return {
    id: 1,
    trackerId: 'abc',
    tracker: 'rutracker',
    title: 'Sample Title',
    rawTitle: 'Raw Title',
    url: 'https://example.com/torrent',
    files: [],
    season: 1,
    haveEpisodes: [1, 2],
    totalEpisodes: 2,
    trackedEpisodes: [],
    magnet: null,
    controlStatus: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...override,
  } satisfies TorrentItemDto;
}

function createStatus(): NormalizedTorrent {
  return {
    id: 'hash',
    name: 'Torrent',
    progress: 50,
    isCompleted: false,
    ratio: 1,
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

afterEach(() => {
  delete process.env.HOOP_LAST_SYNC;
});

describe('torrentsRoute', () => {
  it('returns torrents list with statuses', async () => {
    process.env.HOOP_LAST_SYNC = '2024-01-01T00:00:00.000Z';
    const dto = createTorrentDto();
    getAllMock.mockImplementationOnce(async (page, _limit) => ({
      items: [dto],
      total: 1,
      page,
      hasNext: false,
    } satisfies PagedResult<TorrentItemDto>));
    statusStorage.set(1, createStatus());

    const response = await torrentsRoute.request('/?page=2&limit=5');
    const body = (await response.json()) as ApiResponse<
      PagedResult<TorrentItemDto> & {
        status: Record<string, { data: NormalizedTorrent | undefined }>;
        lastSync: string | null;
      }
    >;

    expect(response.status).toBe(200);
    expect(getAllMock).toHaveBeenCalledWith(2, 5);
    expect(body.success).toBe(true);
    expect(body.data?.items[0]?.id).toBe(dto.id);
    expect(body.data?.status['1']?.data?.id).toBe('hash');
    expect(body.data?.lastSync).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns error when service fails', async () => {
    getAllMock.mockRejectedValueOnce(new Error('failed'));

    const response = await torrentsRoute.request('/?page=1&limit=10');
    const body = (await response.json()) as ApiResponse<unknown>;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe('failed');
  });
});

describe('torrentsStatusRoute', () => {
  it('returns in-memory statuses', async () => {
    statusStorage.set(1, createStatus());

    const response = await torrentsStatusRoute.request('/');
    const body = (await response.json()) as ApiResponse<
      Record<string, { data: NormalizedTorrent | undefined }>
    >;

    expect(response.status).toBe(200);
    expect(body.data?.['1']?.data?.name).toBe('Torrent');
  });
});

describe('torrentsAddRoute', () => {
  beforeEach(() => {
    addOrUpdateMock.mockReset();
    markAsTrackedAllMock.mockReset();
    markAsDownloadRequestedMock.mockReset();
  });

  it('adds torrent without extra actions', async () => {
    const dto = createTorrentDto();
    addOrUpdateMock.mockResolvedValueOnce(dto);

    const response = await torrentsAddRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com',
        selectAll: false,
        startDownload: false,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<TorrentItemDto | null>;

    expect(response.status).toBe(200);
    expect(addOrUpdateMock).toHaveBeenCalledTimes(1);
    expect(markAsTrackedAllMock).not.toHaveBeenCalled();
    expect(markAsDownloadRequestedMock).not.toHaveBeenCalled();
    expect(body.data?.id).toBe(dto.id);
  });

  it('marks torrent for download and tracking', async () => {
    const dto = createTorrentDto();
    addOrUpdateMock.mockResolvedValueOnce(dto);
    markAsTrackedAllMock.mockResolvedValueOnce();
    markAsDownloadRequestedMock.mockResolvedValueOnce();

    const response = await torrentsAddRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com',
        selectAll: true,
        startDownload: true,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<TorrentItemDto | null>;

    expect(response.status).toBe(200);
    expect(markAsTrackedAllMock).toHaveBeenCalledTimes(1);
    expect(markAsDownloadRequestedMock).toHaveBeenCalledTimes(1);
    expect(body.data?.controlStatus).toBe('downloadRequested');
  });

  it('returns error when add fails', async () => {
    addOrUpdateMock.mockRejectedValueOnce(new Error('broken'));

    const response = await torrentsAddRoute.request('/', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com',
        selectAll: false,
        startDownload: false,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe('broken');
  });
});

describe('torrentsDeleteRoute', () => {
  beforeEach(() => {
    deleteMock.mockReset();
    torrentItemCtorSpy.mockClear();
  });

  it('deletes torrent and returns success response', async () => {
    deleteMock.mockResolvedValueOnce();
    const app = mountRoute('/torrents/:id/delete', torrentsDeleteRoute);

    const response = await app.request('/torrents/5/delete', {
      method: 'DELETE',
      body: JSON.stringify({ withFiles: true }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(true);
    expect(torrentItemCtorSpy).toHaveBeenCalledWith({ id: 5 });
    expect(body.message).toBe('Torrent deleted');
  });

  it('returns error when deletion fails', async () => {
    deleteMock.mockRejectedValueOnce(new Error('delete failed'));
    const app = mountRoute('/torrents/:id/delete', torrentsDeleteRoute);

    const response = await app.request('/torrents/5/delete', {
      method: 'DELETE',
      body: JSON.stringify({ withFiles: false }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('delete failed');
  });
});

describe('torrentsSaveRoute', () => {
  beforeEach(() => {
    updateTrackedEpisodesMock.mockReset();
  });

  it('saves selected episodes', async () => {
    updateTrackedEpisodesMock.mockResolvedValueOnce();
    const app = mountRoute('/torrents/:id/save', torrentsSaveRoute);

    const response = await app.request('/torrents/2/save', {
      method: 'POST',
      body: JSON.stringify({ episodes: [1, 2] }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(200);
    expect(updateTrackedEpisodesMock).toHaveBeenCalledWith([1, 2]);
    expect(body.message).toBe('Episodes updated');
  });

  it('returns error when save fails', async () => {
    updateTrackedEpisodesMock.mockRejectedValueOnce(new Error('save failed'));
    const app = mountRoute('/torrents/:id/save', torrentsSaveRoute);

    const response = await app.request('/torrents/2/save', {
      method: 'POST',
      body: JSON.stringify({ episodes: [1] }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('save failed');
  });
});

describe('deleteFileRoute', () => {
  beforeEach(() => {
    deleteFileEpisodeMock.mockReset();
  });

  it('deletes episode file', async () => {
    deleteFileEpisodeMock.mockResolvedValueOnce();
    const app = mountRoute('/files/:id/delete', deleteFileRoute);

    const response = await app.request('/files/3/delete', {
      method: 'DELETE',
      body: JSON.stringify({ filePath: '/path/to/file.mkv' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(200);
    expect(deleteFileEpisodeMock).toHaveBeenCalledWith('/path/to/file.mkv');
    expect(body.message).toBe('File deleted');
  });

  it('returns error when file deletion fails', async () => {
    deleteFileEpisodeMock.mockRejectedValueOnce(new Error('file failed'));
    const app = mountRoute('/files/:id/delete', deleteFileRoute);

    const response = await app.request('/files/3/delete', {
      method: 'DELETE',
      body: JSON.stringify({ filePath: '/path/to/file.mkv' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('file failed');
  });
});
