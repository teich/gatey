CREATE TABLE `unifi_inventory_snapshot` (
	`id` integer PRIMARY KEY,
	`users_json` text DEFAULT '[]' NOT NULL,
	`visitors_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_attempted_at` text,
	`last_succeeded_at` text,
	`last_changed_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "unifi_inventory_snapshot_singleton_check" CHECK("id" = 1)
);
