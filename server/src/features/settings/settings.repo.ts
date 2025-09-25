import db from '@server/db';
import {
  userSettings,
  type DbUserSettings,
  type DbUserSettingsInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';

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
    data: Partial<Omit<DbUserSettingsInsert, 'id'>>
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
