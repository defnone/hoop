import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GenericEndpointContext } from 'better-auth';

import { onBeforeUserCreate, onAfterUserCreate } from '@server/lib/auth-hooks';
import { usersCountStorage } from '@server/lib/users-count-storage';

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async upsert() {
      return Promise.resolve();
    }
  },
}));

function createTestContext() {
  const warn = vi.fn();

  const ctx = {
    context: {
      logger: {
        warn,
      },
    },
  } as unknown as GenericEndpointContext;

  return { ctx, warn };
}

describe('auth hooks: single user sign-up', () => {
  beforeEach(() => {
    usersCountStorage.clear();
  });

  it('allows initial sign-up when count is empty', async () => {
    const { ctx, warn } = createTestContext();

    const result = await onBeforeUserCreate({}, ctx);

    expect(result).toBeUndefined();
    expect(usersCountStorage.get('count')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('increments stored count after successful registration', async () => {
    await onAfterUserCreate();

    expect(usersCountStorage.get('count')).toBe(1);

    await onAfterUserCreate();

    expect(usersCountStorage.get('count')).toBe(2);
  });

  it('blocks subsequent sign-up attempts once a user exists', async () => {
    const { ctx, warn } = createTestContext();

    await onAfterUserCreate();

    const result = await onBeforeUserCreate({}, ctx);

    expect(result).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(usersCountStorage.get('count')).toBe(1);
  });
});
