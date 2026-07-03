import { SettingsService } from '@server/features/settings/settings.service';

export async function onAfterUserCreate(): Promise<void> {
  await new SettingsService({ data: {} }).upsert();
}
