import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SingleUserSignup,
  type SingleUserSignupDatabasePort,
} from '@server/lib/single-user-signup';
import { usersCountStorage } from '@server/lib/users-count-storage';

describe('SingleUserSignup', () => {
  let database: SignupDatabase;
  let signup: SingleUserSignup;

  beforeEach(() => {
    database = new SignupDatabase();
    signup = new SingleUserSignup(database);
    usersCountStorage.clear();
  });

  it('creates exactly one user from concurrent sign-up requests', async () => {
    const requests = Array.from({ length: 10 }, (_, index) =>
      signup.handle(createSignUpRequest(), async () => {
        database.insertUser(`user-${index}`);
        await Promise.resolve();
        return Response.json({ success: true });
      }),
    );

    const responses = await Promise.all(requests);

    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 403),
    ).toHaveLength(9);
    expect(database.getUserCount()).toBe(1);
    expect(usersCountStorage.get('count')).toBe(1);
    expect(database.beginImmediateCalls).toBe(10);
  });

  it('rolls back user creation when auth handler fails', async () => {
    const failedResponse = await signup.handle(
      createSignUpRequest(),
      async () => {
        database.insertUser('failed');
        return Response.json({ success: false }, { status: 500 });
      },
    );

    const successfulResponse = await signup.handle(
      createSignUpRequest(),
      async () => {
        database.insertUser('owner');
        return Response.json({ success: true });
      },
    );

    expect(failedResponse.status).toBe(500);
    expect(successfulResponse.status).toBe(200);
    expect(database.getUserCount()).toBe(1);
  });

  it('rolls back and releases lock when auth handler throws', async () => {
    await expect(
      signup.handle(createSignUpRequest(), async () => {
        database.insertUser('failed');
        throw new Error('Authentication failed');
      }),
    ).rejects.toThrowError('Authentication failed');

    const response = await signup.handle(createSignUpRequest(), async () => {
      database.insertUser('owner');
      return Response.json({ success: true });
    });

    expect(response.status).toBe(200);
    expect(database.getUserCount()).toBe(1);
  });

  it('passes non-sign-up requests directly to auth handler', async () => {
    const handler = vi.fn(
      async (): Promise<Response> => Response.json({ success: true }),
    );

    const response = await signup.handle(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
      }),
      handler,
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(database.beginImmediateCalls).toBe(0);
  });
});

class SignupDatabase implements SingleUserSignupDatabasePort {
  beginImmediateCalls = 0;
  private committedUsers = new Set<string>();
  private pendingUsers: Set<string> | null = null;

  beginImmediate(): void {
    if (this.pendingUsers) {
      throw new Error('Transaction already active');
    }

    this.beginImmediateCalls += 1;
    this.pendingUsers = new Set(this.committedUsers);
  }

  commit(): void {
    this.committedUsers = this.requireTransaction();
    this.pendingUsers = null;
  }

  rollback(): void {
    this.requireTransaction();
    this.pendingUsers = null;
  }

  getUserCount(): number {
    return (this.pendingUsers ?? this.committedUsers).size;
  }

  insertUser(id: string): void {
    this.requireTransaction().add(id);
  }

  private requireTransaction(): Set<string> {
    if (!this.pendingUsers) {
      throw new Error('Transaction is not active');
    }

    return this.pendingUsers;
  }
}

// Utilities

function createSignUpRequest(): Request {
  return new Request('http://localhost:3000/api/auth/sign-up/email', {
    method: 'POST',
  });
}
