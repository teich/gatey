CREATE TABLE `shortcut_connections` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`household_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_attempt_at` integer,
	`last_used_at` integer,
	CONSTRAINT `fk_shortcut_connections_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_shortcut_connections_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `shortcut_pairings` (
	`code_hash` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`household_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_shortcut_pairings_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_shortcut_pairings_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shortcut_connections_token_uidx` ON `shortcut_connections` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `shortcut_connections_user_household_uidx` ON `shortcut_connections` (`user_id`,`household_id`);