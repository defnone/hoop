DROP INDEX `torrent_items_transmission_id_unique`;--> statement-breakpoint
ALTER TABLE `torrent_items` RENAME COLUMN `transmission_id` TO `torrent_client_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `torrent_items_torrent_client_id_unique` ON `torrent_items` (`torrent_client_id`);--> statement-breakpoint
ALTER TABLE `torrent_items` ADD `torrent_client_type` text DEFAULT 'transmission' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `torrent_client_type` text DEFAULT 'transmission' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `torrent_client_url` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `torrent_client_username` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `torrent_client_password` text;
