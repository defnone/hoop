import db from '@server/db';
import {
  eventJournal,
  type DbEventJournal,
  type DbEventJournalInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';

export class EventJournalRepo {
  private readonly database: BunSQLiteDatabase;

  constructor(database = db) {
    this.database = database;
  }

  async findAll(
    page: number,
    limit: number,
  ): Promise<{ items: DbEventJournal[]; total: number }> {
    const offset: number = (page - 1) * limit;
    const rows = await this.database
      .select({
        ...getTableColumns(eventJournal),
        total: sql<number>`count(*) over()`,
      })
      .from(eventJournal)
      .orderBy(desc(eventJournal.createdAt), desc(eventJournal.id))
      .limit(limit)
      .offset(offset);

    const total: number =
      rows.length > 0 &&
      typeof (rows[0] as { total?: number }).total === 'number'
        ? (rows[0] as { total: number }).total
        : rows.length;
    const items: DbEventJournal[] = rows.map(
      ({ total: _total, ...rest }) => rest as DbEventJournal,
    );

    return { items, total };
  }

  async create(
    data: DbEventJournalInsert,
  ): Promise<DbEventJournal | undefined> {
    const [row] = await this.database
      .insert(eventJournal)
      .values(data)
      .returning();
    await this.trimTo(EVENT_JOURNAL_LIMIT);
    return row;
  }

  async trimTo(limit: number): Promise<void> {
    await this.database.run(sql`
      DELETE FROM ${eventJournal}
      WHERE ${eventJournal.id} NOT IN (
        SELECT ${eventJournal.id}
        FROM ${eventJournal}
        ORDER BY ${eventJournal.createdAt} DESC, ${eventJournal.id} DESC
        LIMIT ${limit}
      )
    `);
  }

  async markAsRead(id: number): Promise<DbEventJournal | undefined> {
    const [row] = await this.database
      .update(eventJournal)
      .set({ readAt: Date.now() })
      .where(eq(eventJournal.id, id))
      .returning();
    return row;
  }

  async markAllAsRead(): Promise<DbEventJournal[]> {
    return await this.database
      .update(eventJournal)
      .set({ readAt: Date.now() })
      .where(isNull(eventJournal.readAt))
      .returning();
  }

  async deleteAll(): Promise<DbEventJournal[]> {
    return await this.database.delete(eventJournal).returning();
  }
}

const EVENT_JOURNAL_LIMIT = 500;
