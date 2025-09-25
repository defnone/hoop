import db from '@server/db';
import {
  torrentItems,
  type DbTorrentItem,
  type DbTorrentItemInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';

export class TransmissionClientRepo {
  private readonly database: BunSQLiteDatabase;
  constructor(database = db) {
    this.database = database;
  }

  async findTorrentItemById(id: number) {
    const [row] = await this.database
      .select()
      .from(torrentItems)
      .where(eq(torrentItems.id, id));
    return row ?? null;
  }

  async updateTorrentItem(
    id: number,
    data: Partial<DbTorrentItemInsert>
  ): Promise<DbTorrentItem | null> {
    const [row] = await this.database
      .update(torrentItems)
      .set({
        ...data,
      })
      .where(eq(torrentItems.id, id))
      .returning();
    return row ?? null;
  }
}
