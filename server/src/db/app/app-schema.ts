import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { trackersConf } from '@server/shared/trackers-conf';

export const controlStatuses = [
  'idle',
  'downloadRequested',
  'downloading',
  'downloadCompleted',
  'processing',
  'paused',
] as const;

export const eventJournalTypes = [
  'torrentTitleChanged',
  'torrentMagnetChanged',
  'torrentSyncFailed',
  'torrentDownloadStarted',
  'torrentDownloadCompleted',
  'torrentDownloadFailed',
  'torrentFileCopyStarted',
  'torrentFileCopyCompleted',
  'torrentFileCopyFailed',
  'transmissionUnavailable',
  'seriesDirectoryCleanupCompleted',
  'seriesDirectoryCleanupFailed',
] as const;

export const eventJournalStates = ['info', 'error'] as const;

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
    torrentClientId: text('torrent_client_id').unique(),
    torrentClientType: text('torrent_client_type', {
      enum: ['transmission', 'qbittorrent'],
    })
      .default('transmission')
      .notNull(),
    controlStatus: text('control_status', {
      enum: controlStatuses,
    })
      .default('idle')
      .notNull(),
    tracker: text('tracker', {
      enum: Object.keys(trackersConf) as [string, ...string[]],
    }).notNull(),
    errorMessage: text('error_message'),
    notifyOnTitleChange: int('notify_on_title_change', { mode: 'boolean' })
      .default(false)
      .notNull(),
    notifyOnMagnetChange: int('notify_on_magnet_change', { mode: 'boolean' })
      .default(false)
      .notNull(),
    notifyOnDownloadComplete: int('notify_on_download_complete', {
      mode: 'boolean',
    })
      .default(true)
      .notNull(),
  },
  (t) => [index('tracker_index').on(t.tracker)],
);

export const userSettings = sqliteTable('user_settings', {
  id: int('id').primaryKey({ autoIncrement: true }),
  telegramId: int('telegram_id'),
  botToken: text('bot_token'),
  downloadDir: text('download_dir'),
  mediaDir: text('media_dir'),
  cleanEmptySeriesDirectories: int('clean_empty_series_directories', {
    mode: 'boolean',
  })
    .default(false)
    .notNull(),
  deleteAfterDownload: int('delete_after_download', {
    mode: 'boolean',
  }).default(false),
  syncInterval: int('sync_interval').default(30).notNull(),
  torrentClientType: text('torrent_client_type', {
    enum: ['transmission', 'qbittorrent'],
  })
    .default('transmission')
    .notNull(),
  torrentClientUrl: text('torrent_client_url'),
  torrentClientUsername: text('torrent_client_username'),
  torrentClientPassword: text('torrent_client_password'),
  jackettApiKey: text('jackett_api_key'),
  jackettUrl: text('jackett_url'),
  kinozalUsername: text('kinozal_username'),
  kinozalPassword: text('kinozal_password'),
  flaresolverrEnabled: int('flaresolverr_enabled', {
    mode: 'boolean',
  }).default(false),
  flaresolverrUrl: text('flaresolverr_url'),
  flaresolverrTimeoutSeconds: int('flaresolverr_timeout_seconds')
    .default(60)
    .notNull(),
});

export const eventJournal = sqliteTable(
  'event_journal',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: eventJournalTypes }).notNull(),
    state: text('state', { enum: eventJournalStates })
      .default('info')
      .notNull(),
    torrentItemId: int('torrent_item_id').references(() => torrentItems.id, {
      onDelete: 'set null',
    }),
    torrentTitle: text('torrent_title').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    isNotification: int('is_notification', { mode: 'boolean' })
      .default(true)
      .notNull(),
    readAt: int('read_at'),
    createdAt: int('created_at')
      .default(sql`(strftime('%s', 'now') * 1000)`)
      .notNull(),
  },
  (t) => [
    index('event_journal_created_at_index').on(t.createdAt),
    index('event_journal_read_at_index').on(t.readAt),
  ],
);

export const torrentCopyFailures = sqliteTable('torrent_copy_failures', {
  torrentItemId: int('torrent_item_id')
    .primaryKey()
    .references(() => torrentItems.id, { onDelete: 'cascade' }),
  attemptCount: int('attempt_count').notNull().default(1),
  nextAttemptAt: int('next_attempt_at').notNull(),
  fingerprint: text('fingerprint').notNull(),
  notifiedAt: int('notified_at'),
});

export type DbEventJournal = typeof eventJournal.$inferSelect;
export type DbEventJournalInsert = typeof eventJournal.$inferInsert;

export type DbTorrentItem = typeof torrentItems.$inferSelect;
export type DbTorrentItemInsert = typeof torrentItems.$inferInsert;
export type DbTorrentCopyFailure = typeof torrentCopyFailures.$inferSelect;
export type DbTorrentCopyFailureInsert =
  typeof torrentCopyFailures.$inferInsert;
export type DbUserSettings = typeof userSettings.$inferSelect;
export type DbUserSettingsInsert = typeof userSettings.$inferInsert;
