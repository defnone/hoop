import type { Context, Env } from 'hono';
import logger from '@server/lib/logger';
import type { ApiResponse } from '@shared/types';
import type { Hook as StandardHook } from '@hono/standard-validator';

type StandardValidationHook = StandardHook<unknown, Env, string>;

const respondWithValidationIssues = <E extends Env, P extends string>(
  issues: ReadonlyArray<{ message: string }>,
  c: Context<E, P>
) => {
  return c.json<ApiResponse<null>>(
    {
      success: false,
      message: issues.map((issue) => issue.message).join(', '),
      code: 400,
    },
    400
  );
};

export const handleStandardValidation: StandardValidationHook = (result, c) => {
  if (!result.success) {
    logger.error(result.error);
    return respondWithValidationIssues(result.error, c);
  }
};
