import db from '@server/db';
import logger from './logger';
import { user } from '@server/db/auth/auth-schema';
import { usersCountStorage } from './users-count-storage';
export { formatErrorMessage } from './error-message';

export { usersCountStorage };

export async function getUserCount() {
  if (!usersCountStorage.get('count')) {
    const users = await db.$count(user);
    usersCountStorage.set('count', users);
    logger.debug(
      `[usersStateStorage] Users count: ${usersCountStorage.get('count')}`
    );
    return users ?? 1;
  }
}

export function normalizeBaseUrl(hostOrUrl: string): string {
  const candidate = hostOrUrl.startsWith('http')
    ? hostOrUrl
    : `https://${hostOrUrl}`;

  try {
    return new URL(candidate).origin;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to normalize base URL from ${hostOrUrl}: ${detail}`
    );
  }
}
