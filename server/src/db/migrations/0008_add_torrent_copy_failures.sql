CREATE TABLE `torrent_copy_failures` (
	`torrent_item_id` integer PRIMARY KEY NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`notified_at` integer,
	FOREIGN KEY (`torrent_item_id`) REFERENCES `torrent_items`(`id`) ON UPDATE no action ON DELETE cascade
);
