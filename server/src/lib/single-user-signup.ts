import logger from '@server/lib/logger';
import { usersCountStorage } from '@server/lib/users-count-storage';

const SIGN_UP_PATH = '/api/auth/sign-up/email';

export class SingleUserSignup {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly database: SingleUserSignupDatabasePort) {}

  async handle(
    request: Request,
    authHandler: () => Promise<Response>,
  ): Promise<Response> {
    if (!isEmailSignUpRequest(request)) {
      return authHandler();
    }

    return this.runExclusive(async () => this.runTransaction(authHandler));
  }

  private async runExclusive(
    operation: () => Promise<Response>,
  ): Promise<Response> {
    const previous = this.queue;
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.queue = previous.then(() => current);
    await previous;

    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  private async runTransaction(
    authHandler: () => Promise<Response>,
  ): Promise<Response> {
    this.database.beginImmediate();

    try {
      if (this.database.getUserCount() > 0) {
        this.database.rollback();
        return createSignUpDisabledResponse();
      }

      const response = await authHandler();
      if (!response.ok) {
        this.database.rollback();
        return response;
      }

      this.database.commit();
      updateUserCountIndicator(this.database);
      return response;
    } catch (error) {
      rollbackTransaction(this.database);
      throw error;
    }
  }
}

export interface SingleUserSignupDatabasePort {
  beginImmediate(): void;
  commit(): void;
  rollback(): void;
  getUserCount(): number;
}

// Utilities

function isEmailSignUpRequest(request: Request): boolean {
  return (
    request.method === 'POST' && new URL(request.url).pathname === SIGN_UP_PATH
  );
}

function createSignUpDisabledResponse(): Response {
  return Response.json({ message: 'Sign-up disabled' }, { status: 403 });
}

function updateUserCountIndicator(
  database: SingleUserSignupDatabasePort,
): void {
  const count = database.getUserCount();
  usersCountStorage.set('count', count);

  if (count > 1) {
    logger.error(
      { userCount: count },
      'Critical: single-user invariant violated',
    );
  }
}

function rollbackTransaction(database: SingleUserSignupDatabasePort): void {
  try {
    database.rollback();
  } catch (error) {
    logger.error({ error }, 'Failed to roll back sign-up transaction');
  }
}
