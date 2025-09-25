import db from '@server/db';
import {
  torrentItems,
  type DbTorrentItem,
  type DbTorrentItemInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, sql, desc, getTableColumns } from 'drizzle-orm';

export class TorrentItemRepo {
  private readonly database: BunSQLiteDatabase;
  constructor(database = db) {
    this.database = database;
  }

  async findAll(page: number, limit: number) {
    // Using window function to get the total number of rows alongside paginated items
    const offset = (page - 1) * limit;
    const rows = await this.database
      .select({
        ...getTableColumns(torrentItems),
        total: sql<number>`count(*) over()`,
      })
      .from(torrentItems)
      .orderBy(desc(torrentItems.updatedAt))
      .limit(limit)
      .offset(offset);

    const total =
      rows.length > 0 &&
      typeof (rows[0] as { total?: number }).total === 'number'
        ? (rows[0] as { total: number }).total
        : rows.length;
    const items = rows.map(
      ({ total: _total, ...rest }) => rest as DbTorrentItem
    );
    return { items, total };
  }

  async findById(id: number) {
    const [row] = await this.database
      .select()
      .from(torrentItems)
      .where(eq(torrentItems.id, id));
    return row ?? null;
  }

  async findByTrackerId(trackerId: string) {
    const [row] = await this.database
      .select()
      .from(torrentItems)
      .where(eq(torrentItems.trackerId, trackerId));
    return row ?? null;
  }

  async upsert(data: DbTorrentItemInsert) {
    const [row] = await this.database
      .insert(torrentItems)
      .values({
        ...data,
      })
      .returning()
      .onConflictDoUpdate({
        target: torrentItems.trackerId,
        set: {
          ...data,
          updatedAt: Date.now(),
        },
      });
    return row;
  }

  async update(
    id: number,
    data: Partial<DbTorrentItemInsert>
  ): Promise<DbTorrentItem | undefined> {
    const [row] = await this.database
      .update(torrentItems)
      .set({
        ...data,
      })
      .where(eq(torrentItems.id, id))
      .returning();
    return row;
  }

  async deleteById(id: number) {
    await this.database.delete(torrentItems).where(eq(torrentItems.id, id));
  }
}
