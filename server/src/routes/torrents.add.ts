import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import { z } from 'zod';
import logger from '@server/lib/logger';
import { zValidator } from '@hono/zod-validator';

const jsonSchema = z.object({
  url: z.url(),
  selectAll: z.boolean(),
  startDownload: z.boolean(),
});

export const torrentsAddRoute = new Hono().post(
  '/',
  zValidator('json', jsonSchema),
  async (c) => {
    const { url, selectAll, startDownload } = c.req.valid('json');

    try {
      const ti = new TorrentItem({
        url,
      });

      const dto = await ti.addOrUpdate();

      if (selectAll) await ti.markAsTrackedAll();
      if (startDownload && dto) {
        await ti.markAsDownloadRequested();
        dto.controlStatus = 'downloadRequested';
      }

      const response: ApiResponse<typeof dto> = {
        success: true,
        data: dto,
      };
      return c.json(response);
    } catch (e) {
      const response: ApiResponse = {
        success: false,
        message: (e as Error).message,
      };
      logger.error(e);
      return c.json(response, 400);
    }
  }
);
