ALTER TABLE `torrent_items` ADD `notify_on_title_change` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `torrent_items` ADD `notify_on_magnet_change` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `torrent_items` ADD `notify_on_download_complete` integer DEFAULT true NOT NULL;