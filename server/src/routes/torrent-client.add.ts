import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import { sValidator } from '@hono/standard-validator';
import { z } from 'zod';
import { handleStandardValidation } from '@server/lib/validation';
import { TorrentClientService } from '@server/features/torrent-client/torrent-client.service';
import type { TorrentClientAddRequest } from '@server/external/adapters/torrent-client';
import logger from '@server/lib/logger';

const MAX_TORRENT_FILE_SIZE = 10 * 1024 * 1024;

const addTorrentFormSchema = z
  .strictObject({
    magnet: z.string().trim().optional(),
    downloadDir: z.string().trim().optional(),
    torrentFile: z
      .file()
      .max(MAX_TORRENT_FILE_SIZE)
      .refine(
        (file) => file.name.toLowerCase().endsWith('.torrent'),
        'Torrent file must have a .torrent extension',
      )
      .optional(),
  })
  .refine(
    (value) => Boolean(value.magnet) !== Boolean(value.torrentFile),
    'Provide either a magnet link or a torrent file',
  )
  .refine(
    (value) =>
      !value.magnet || value.magnet.toLowerCase().startsWith('magnet:'),
    {
      path: ['magnet'],
      message: 'Magnet link must use the magnet protocol',
    },
  );

export const torrentClientManualAddRoute = new Hono().post(
  '/',
  sValidator('form', addTorrentFormSchema, handleStandardValidation),
  async (c) => {
    const form = c.req.valid('form');

    try {
      const request = await createAddRequest(form);
      await new TorrentClientService().addTorrent(request);

      const response: ApiResponse<null> = {
        success: true,
        message: 'Torrent added to client',
      };
      return c.json(response);
    } catch (error) {
      logger.error(error);
      const response: ApiResponse<null> = {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to add torrent',
      };
      return c.json(response, 400);
    }
  },
);

async function createAddRequest(form: {
  magnet?: string;
  downloadDir?: string;
  torrentFile?: File;
}): Promise<TorrentClientAddRequest> {
  if (form.torrentFile) {
    return {
      source: 'file',
      content: new Uint8Array(await form.torrentFile.arrayBuffer()),
      filename: form.torrentFile.name,
      downloadDir: form.downloadDir,
    };
  }

  if (form.magnet) {
    return {
      source: 'magnet',
      magnet: form.magnet,
      downloadDir: form.downloadDir,
    };
  }

  throw new Error('Provide either a magnet link or a torrent file');
}
