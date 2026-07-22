import { Hono } from 'hono/tiny';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import type { ApiResponse } from '@shared/types';
import { handleStandardValidation } from '@server/lib/validation';
import { verifyTorrentClientConnection } from '@server/external/adapters/torrent-client';
import logger from '@server/lib/logger';

const connectionSchema = z.object({
  type: z.enum(['transmission', 'qbittorrent']),
  url: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
});

type TorrentClientConnectionResultDto = {
  version: string;
};

export const torrentClientVerifyRoute = new Hono().post(
  '/',
  sValidator('json', connectionSchema, handleStandardValidation),
  async (c) => {
    try {
      const version = await verifyTorrentClientConnection(c.req.valid('json'));
      return c.json<ApiResponse<TorrentClientConnectionResultDto>>({
        success: true,
        data: { version },
        message: 'Torrent client connection successful',
      });
    } catch (error: unknown) {
      logger.error(error);
      return c.json<ApiResponse<null>>(
        {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Torrent client connection failed',
        },
        400,
      );
    }
  },
);
