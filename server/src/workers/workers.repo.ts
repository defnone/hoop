import db from '@server/db';
import {
  torrentItems,
  torrentCopyFailures,
  userSettings,
  type DbTorrentItem,
  type DbTorrentItemInsert,
  type DbTorrentCopyFailure,
  type DbTorrentCopyFailureInsert,
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

  async findAllNeedToControl() {
    const rows = await this.database
      .select()
      .from(torrentItems)
      .where(
        or(
          eq(torrentItems.controlStatus, 'downloadRequested'),
          eq(torrentItems.controlStatus, 'downloading'),
          eq(torrentItems.controlStatus, 'downloadCompleted'),
          eq(torrentItems.controlStatus, 'idle'),
          eq(torrentItems.controlStatus, 'paused'),
        ),
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
      .set({ controlStatus: 'idle', torrentClientId: null })
      .where(eq(torrentItems.id, id));
  }

  async findCopyFailure(
    torrentItemId: number,
  ): Promise<DbTorrentCopyFailure | undefined> {
    const [row] = await this.database
      .select()
      .from(torrentCopyFailures)
      .where(eq(torrentCopyFailures.torrentItemId, torrentItemId))
      .limit(1);
    return row;
  }

  async saveCopyFailure(data: DbTorrentCopyFailureInsert): Promise<void> {
    await this.database
      .insert(torrentCopyFailures)
      .values(data)
      .onConflictDoUpdate({
        target: torrentCopyFailures.torrentItemId,
        set: data,
      });
  }

  async deleteCopyFailure(torrentItemId: number): Promise<void> {
    await this.database
      .delete(torrentCopyFailures)
      .where(eq(torrentCopyFailures.torrentItemId, torrentItemId));
  }

  async update(
    id: number,
    data: Partial<DbTorrentItemInsert>,
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
