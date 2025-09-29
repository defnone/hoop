import type { Env } from 'hono';
import logger from '@server/lib/logger';
import type { ApiResponse } from '@shared/types';
import type { Hook } from '@hono/zod-validator';

type ZodHook = Hook<unknown, Env, string>;

export const handleZodValidation: ZodHook = (result, c) => {
  if (!result.success) {
    logger.error(result.error);
    return c.json<ApiResponse<null>>(
      {
        success: false,
        message: result.error.issues.map((issue) => issue.message).join(', '),
        code: 400,
      },
      400
    );
  }
};
