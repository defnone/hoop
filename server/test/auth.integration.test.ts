import { describe, it, expect, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

import { onAfterUserCreate } from '@server/lib/auth-hooks';

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async upsert() {
      return Promise.resolve();
    }
  },
}));

const createMemoryDb = () => ({
  user: [] as Record<string, unknown>[],
  account: [] as Record<string, unknown>[],
  session: [] as Record<string, unknown>[],
  verification: [] as Record<string, unknown>[],
  authenticator: [] as Record<string, unknown>[],
  token: [] as Record<string, unknown>[],
  rateLimit: [] as Record<string, unknown>[],
});

function createAuthInstance() {
  const db = createMemoryDb();

  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'test-secret',
    database: memoryAdapter(db),
    session: {
      expiresIn: 60,
      updateAge: 60,
    },
    rateLimit: {
      enabled: false,
    },
    databaseHooks: {
      user: {
        create: {
          after: onAfterUserCreate,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
  });
}

describe('auth integration', () => {
  it('creates initial user and default settings', async () => {
    const auth = createAuthInstance();

    const firstUser = await auth.api.signUpEmail({
      body: {
        name: 'First User',
        email: 'first@example.com',
        password: 'password123',
      },
    });

    expect(firstUser.user.email).toBe('first@example.com');
  });
});
