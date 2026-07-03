import type { SingleUserSignupDatabasePort } from '@server/lib/single-user-signup';

interface UserCountStatement {
  get(): { count: number } | null;
}

interface SqliteSignupClient {
  exec(query: string): void;
  query(query: string): UserCountStatement;
}

export class SqliteSingleUserSignupDatabase
  implements SingleUserSignupDatabasePort
{
  constructor(private readonly database: SqliteSignupClient) {}

  beginImmediate(): void {
    this.database.exec('BEGIN IMMEDIATE');
  }

  commit(): void {
    this.database.exec('COMMIT');
  }

  rollback(): void {
    this.database.exec('ROLLBACK');
  }

  getUserCount(): number {
    const row = this.database.query('SELECT COUNT(*) AS count FROM user').get();
    return row?.count ?? 0;
  }
}
