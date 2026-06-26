import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { updateWorker } from '@server/workers/update-worker.instance';

export type TorrentSyncStatusDto = {
  lastSync: string | null;
  isRunning: boolean;
};

export const torrentsSyncRoute = new Hono()
  .get('/', (c) => {
    const response: ApiResponse<TorrentSyncStatusDto> = {
      success: true,
      data: getTorrentSyncStatus(),
    };

    return c.json(response);
  })
  .post('/', (c) => {
    const started = updateWorker.startNow();
    const response: ApiResponse<{ started: boolean }> = {
      success: started,
      data: { started },
      message: started
        ? 'Torrent sync started'
        : 'Torrent sync is already running',
    };

    return c.json(response, started ? 202 : 409);
  });

function getTorrentSyncStatus(): TorrentSyncStatusDto {
  return {
    lastSync: process.env.HOOP_LAST_SYNC ?? null,
    isRunning: updateWorker.isRunning(),
  };
}
