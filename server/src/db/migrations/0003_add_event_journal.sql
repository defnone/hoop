CREATE TABLE `event_journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`torrent_item_id` integer,
	`torrent_title` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`is_notification` integer DEFAULT true NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`torrent_item_id`) REFERENCES `torrent_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_journal_created_at_index` ON `event_journal` (`created_at`);
--> statement-breakpoint
CREATE INDEX `event_journal_read_at_index` ON `event_journal` (`read_at`);
