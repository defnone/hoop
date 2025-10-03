import db from '@server/db';
import {
  torrentItems,
  userSettings,
  type DbTorrentItem,
  type DbTorrentItemInsert,
} from '@server/db/app/app-schema';
import { logger } from 'better-auth';
import { eq, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export class WorkersRepo {
  private readonly database: BunSQLiteDatabase;
  constructor(database = db) {
    this.database = database;
  }

  async findAllIdle() {
    return this.database
      .select()
      .from(torrentItems)
      .where(eq(torrentItems.controlStatus, 'idle'));
  }

  async findAllDownloads() {
    const rows = await this.database
      .select()
      .from(torrentItems)
      .where(
        or(
          eq(torrentItems.controlStatus, 'downloadRequested'),
          eq(torrentItems.controlStatus, 'downloading'),
          eq(torrentItems.controlStatus, 'downloadCompleted'),
          eq(torrentItems.controlStatus, 'idle')
        )
      );

    return rows ?? null;
  }

  async findSettings() {
    const rows = await this.database.select().from(userSettings);
    if (rows.length > 1) logger.warn('More than one settings found');
    return rows[0] ?? null;
  }

  async markAsCompleted(id: number) {
    await this.database
      .update(torrentItems)
      .set({ controlStatus: 'downloadCompleted' })
      .where(eq(torrentItems.id, id));
  }

  async markAsProcessing(id: number) {
    await this.database
      .update(torrentItems)
      .set({ controlStatus: 'processing' })
      .where(eq(torrentItems.id, id));
  }

  async markAsIdle(id: number) {
    await this.database
      .update(torrentItems)
      .set({ controlStatus: 'idle', transmissionId: null })
      .where(eq(torrentItems.id, id));
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
}
