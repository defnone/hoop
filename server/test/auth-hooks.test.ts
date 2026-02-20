import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@better-auth/core/db';

import { onBeforeUserCreate, onAfterUserCreate } from '@server/lib/auth-hooks';
import { usersCountStorage } from '@server/lib/users-count-storage';

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async upsert() {
      return Promise.resolve();
    }
  },
}));

function createUser(): User & Record<string, unknown> {
  return {
    id: 'user-1',
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    email: 'user@example.com',
    emailVerified: false,
    name: 'Test User',
    image: null,
  };
}

describe('auth hooks: single user sign-up', () => {
  beforeEach(() => {
    usersCountStorage.clear();
  });

  it('allows initial sign-up when count is empty', async () => {
    const user = createUser();

    const result = await onBeforeUserCreate(user, null);

    expect(result).toBeUndefined();
    expect(usersCountStorage.get('count')).toBeUndefined();
  });

  it('increments stored count after successful registration', async () => {
    await onAfterUserCreate();

    expect(usersCountStorage.get('count')).toBe(1);

    await onAfterUserCreate();

    expect(usersCountStorage.get('count')).toBe(2);
  });

  it('blocks subsequent sign-up attempts once a user exists', async () => {
    const user = createUser();

    await onAfterUserCreate();

    const result = await onBeforeUserCreate(user, null);

    expect(result).toBe(false);
    expect(usersCountStorage.get('count')).toBe(1);
  });
});
