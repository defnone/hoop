import { describe, expect, it, vi } from 'vitest';

import { onAfterUserCreate } from '@server/lib/auth-hooks';

const { upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async upsert(): Promise<void> {
      return upsertMock();
    }
  },
}));

describe('auth hooks', () => {
  it('creates default settings after user registration', async () => {
    await onAfterUserCreate();

    expect(upsertMock).toHaveBeenCalledOnce();
  });
});
