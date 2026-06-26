import { describe, expect, it, vi, beforeEach } from 'vitest';
import { torrentsSyncRoute } from '@server/routes/torrents.sync';

const { isRunningMock, startNowMock } = vi.hoisted(() => ({
  isRunningMock: vi.fn((): boolean => false),
  startNowMock: vi.fn((): boolean => false),
}));

vi.mock('@server/workers/update-worker.instance', () => ({
  updateWorker: {
    isRunning: isRunningMock,
    startNow: startNowMock,
  },
}));

describe('torrentsSyncRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HOOP_LAST_SYNC;
  });

  it('returns torrent sync status', async () => {
    process.env.HOOP_LAST_SYNC = '12345';
    isRunningMock.mockReturnValue(true);

    const response = await torrentsSyncRoute.request('/');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: {
        lastSync: '12345',
        isRunning: true,
      },
    });
  });

  it('starts torrent sync', async () => {
    startNowMock.mockReturnValue(true);

    const response = await torrentsSyncRoute.request('/', {
      method: 'POST',
    });
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toEqual({
      success: true,
      data: { started: true },
      message: 'Torrent sync started',
    });
    expect(startNowMock).toHaveBeenCalledTimes(1);
  });

  it('returns conflict when torrent sync is already running', async () => {
    startNowMock.mockReturnValue(false);

    const response = await torrentsSyncRoute.request('/', {
      method: 'POST',
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({
      success: false,
      data: { started: false },
      message: 'Torrent sync is already running',
    });
  });
});
