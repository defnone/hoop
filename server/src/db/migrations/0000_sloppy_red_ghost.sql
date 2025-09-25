CREATE TABLE `torrent_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tracker_id` text NOT NULL,
	`raw_title` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`magnet` text NOT NULL,
	`season` integer,
	`tracked_episodes` text DEFAULT '[]' NOT NULL,
	`have_episodes` text DEFAULT '[]' NOT NULL,
	`total_episodes` integer,
	`files` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`transmission_id` text,
	`control_status` text DEFAULT 'idle' NOT NULL,
	`tracker` text NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `torrent_items_tracker_id_unique` ON `torrent_items` (`tracker_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `torrent_items_url_unique` ON `torrent_items` (`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `torrent_items_transmission_id_unique` ON `torrent_items` (`transmission_id`);--> statement-breakpoint
CREATE INDEX `tracker_index` ON `torrent_items` (`tracker`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_id` integer,
	`bot_token` text,
	`download_dir` text,
	`media_dir` text,
	`delete_after_download` integer DEFAULT false,
	`sync_interval` integer DEFAULT 30 NOT NULL,
	`jackett_api_key` text,
	`jackett_url` text,
	`kinozal_username` text,
	`kinozal_password` text
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
