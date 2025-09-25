import type { GenericEndpointContext } from 'better-auth';
import { usersCountStorage } from './users-count-storage';
import { SettingsService } from '@server/features/settings/settings.service';

export async function onBeforeUserCreate(
  _user: unknown,
  ctx?: GenericEndpointContext
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
