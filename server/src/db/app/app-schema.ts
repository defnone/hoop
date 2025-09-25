import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { trackersConf } from '@server/shared/trackers-conf';

export const torrentItems = sqliteTable(
  'torrent_items',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    trackerId: text('tracker_id').notNull().unique(),
    rawTitle: text('raw_title').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull().unique(),
    magnet: text('magnet').notNull(),
    season: int('season'),
    trackedEpisodes: text('tracked_episodes', { mode: 'json' })
      .notNull()
      .default([]),
    haveEpisodes: text('have_episodes', { mode: 'json' }).notNull().default([]),
    totalEpisodes: int('total_episodes'),
    files: text('files', { mode: 'json' }),
    createdAt: int('created_at')
      .default(sql`(strftime('%s', 'now') * 1000)`)
      .notNull(),
    updatedAt: int('updated_at')
      .default(sql`(strftime('%s', 'now') * 1000)`)
      .notNull(),
    transmissionId: text('transmission_id').unique(),
    controlStatus: text('control_status', {
      enum: [
        'idle',
        'donwloadRequested',
        'downloading',
        'downloadCompleted',
        'processing',
      ],
    })
      .default('idle')
      .notNull(),
    tracker: text('tracker', {
      enum: Object.keys(trackersConf) as [string, ...string[]],
    }).notNull(),
    errorMessage: text('error_message'),
  },
  (t) => [index('tracker_index').on(t.tracker)]
);

export const userSettings = sqliteTable('user_settings', {
  id: int('id').primaryKey({ autoIncrement: true }),
  telegramId: int('telegram_id'),
  botToken: text('bot_token'),
  downloadDir: text('download_dir'),
  mediaDir: text('media_dir'),
  deleteAfterDownload: int('delete_after_download', {
    mode: 'boolean',
  }).default(false),
  syncInterval: int('sync_interval').default(30).notNull(),
  jackettApiKey: text('jackett_api_key'),
  jackettUrl: text('jackett_url'),
  kinozalUsername: text('kinozal_username'),
  kinozalPassword: text('kinozal_password'),
});

export type DbTorrentItem = typeof torrentItems.$inferSelect;
export type DbTorrentItemInsert = typeof torrentItems.$inferInsert;
export type DbUserSettings = typeof userSettings.$inferSelect;
export type DbUserSettingsInsert = typeof userSettings.$inferInsert;
