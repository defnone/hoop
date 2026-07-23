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
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: true,
      },
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

  it('changes an unverified email without verification delivery', async () => {
    const auth = createAuthInstance();
    const signUpResponse = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'First User',
          email: 'first@example.com',
          password: 'password123',
        }),
      }),
    );
    const sessionCookie = signUpResponse.headers.get('set-cookie');

    expect(sessionCookie).not.toBeNull();

    const changeEmailResponse = await auth.handler(
      new Request('http://localhost:3000/api/auth/change-email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie ?? '',
        },
        body: JSON.stringify({ newEmail: 'second@example.com' }),
      }),
    );

    expect(changeEmailResponse.status).toBe(200);
    await expect(changeEmailResponse.json()).resolves.toEqual({ status: true });

    const signInResult = await auth.api.signInEmail({
      body: {
        email: 'second@example.com',
        password: 'password123',
      },
    });

    expect(signInResult.user.email).toBe('second@example.com');
  });
});
