import db from '@server/db';
import {
  torrentItems,
  userSettings,
  type DbUserSettings,
  type DbUserSettingsInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { TorrentClientType } from '@server/external/adapters/torrent-client';

export class SettingsRepo {
  private readonly database: BunSQLiteDatabase;
  constructor(database = db) {
    this.database = database;
  }

  async findSettings(): Promise<DbUserSettings | null> {
    const [row] = await this.database
      .select()
      .from(userSettings)
      .where(eq(userSettings.id, 1));
    return row ?? null;
  }

  async hasActiveTorrentForOtherClient(
    clientType: TorrentClientType,
  ): Promise<boolean> {
    const rows = await this.database
      .select({ id: torrentItems.id })
      .from(torrentItems)
      .where(
        and(
          isNotNull(torrentItems.torrentClientId),
          ne(torrentItems.torrentClientType, clientType),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async upsert(data: Omit<DbUserSettingsInsert, 'id'>) {
    const [row] = await this.database
      .insert(userSettings)
      .values({
        id: 1,
        ...data,
      })
      .returning()
      .onConflictDoUpdate({
        target: userSettings.id,
        set: {
          id: 1,
          ...data,
        },
      });
    return row ?? null;
  }

  async update(
    data: Partial<Omit<DbUserSettingsInsert, 'id'>>,
  ): Promise<DbUserSettings | null> {
    const [row] = await this.database
      .update(userSettings)
      .set({
        ...data,
      })
      .where(eq(userSettings.id, 1))
      .returning();
    return row ?? null;
  }
}
