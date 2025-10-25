import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import logger from '@server/lib/logger';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const jsonSchema = z.object({
  url: z.url({ message: 'URL is required' }).trim().min(1),
  selectAll: z.boolean({
    error: 'selectAll is required and must be a boolean',
  }),
  startDownload: z.boolean({
    error: 'startDownload is required and must be a boolean',
  }),
});

export const torrentsAddRoute = new Hono().post(
  '/',
  sValidator('json', jsonSchema, handleStandardValidation),
  async (c) => {
    const { url, selectAll, startDownload } = c.req.valid('json');

    try {
      const ti = new TorrentItem({
        url,
      });

      const dto = await ti.addOrUpdate();

      if (selectAll) await ti.setAllEpisodesTracked();
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
