import type { GenericEndpointContext } from '@better-auth/core';
import type { User } from '@better-auth/core/db';
import { usersCountStorage } from './users-count-storage';
import { SettingsService } from '@server/features/settings/settings.service';

export async function onBeforeUserCreate(
  _user: User & Record<string, unknown>,
  ctx: GenericEndpointContext | null
): Promise<boolean | void>;
export async function onBeforeUserCreate(
  _user: User & Record<string, unknown>,
  ctx?: GenericEndpointContext
): Promise<boolean | void>;
export async function onBeforeUserCreate(
  _user: User & Record<string, unknown>,
  ctx?: GenericEndpointContext | null
): Promise<boolean | void> {
  if ((usersCountStorage.get('count') ?? 0) > 0) {
    ctx?.context.logger.warn('Sign-up disabled');
    return false;
  }
}

export async function onAfterUserCreate(): Promise<void> {
  const currentCount = usersCountStorage.get('count') ?? 0;
  usersCountStorage.set('count', currentCount + 1);
  await new SettingsService({ data: {} }).upsert();
}
