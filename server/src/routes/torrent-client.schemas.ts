import { z } from 'zod';

export const torrentClientIdParamSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/i, {
    message: 'Invalid torrent hash',
  }),
});
