import { describe, expect, it, vi } from 'vitest';

import { SqliteSingleUserSignupDatabase } from '@server/db/single-user-signup-database';

describe('SqliteSingleUserSignupDatabase', () => {
  it('uses immediate SQLite transaction statements', () => {
    const database = createDatabase(0);
    const adapter = new SqliteSingleUserSignupDatabase(database);

    adapter.beginImmediate();
    adapter.commit();
    adapter.rollback();

    expect(database.exec).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE');
    expect(database.exec).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(database.exec).toHaveBeenNthCalledWith(3, 'ROLLBACK');
  });

  it('reads authoritative user count from SQLite', () => {
    const database = createDatabase(2);
    const adapter = new SqliteSingleUserSignupDatabase(database);

    expect(adapter.getUserCount()).toBe(2);
    expect(database.query).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS count FROM user',
    );
  });

  it('returns zero when count query has no row', () => {
    const database = createDatabase(null);
    const adapter = new SqliteSingleUserSignupDatabase(database);

    expect(adapter.getUserCount()).toBe(0);
  });
});

// Utilities

function createDatabase(count: number | null) {
  return {
    exec: vi.fn((_query: string): void => undefined),
    query: vi.fn((_query: string) => ({
      get: (): { count: number } | null => (count === null ? null : { count }),
    })),
  };
}
