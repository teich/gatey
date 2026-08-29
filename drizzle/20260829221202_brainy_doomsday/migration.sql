CREATE TABLE `unifi_access_events` (
	`id` text PRIMARY KEY,
	`occurred_at` text NOT NULL,
	`actor_controller_id` text,
	`actor_type` text DEFAULT '' NOT NULL,
	`actor_display_name` text DEFAULT '' NOT NULL,
	`credential_provider` text DEFAULT '' NOT NULL,
	`event_type` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`display_message` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`door_id` text NOT NULL,
	`door_name` text DEFAULT '' NOT NULL,
	`activity_resource_id` text,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unifi_access_sync_state` (
	`id` integer PRIMARY KEY,
	`state` text DEFAULT 'idle' NOT NULL,
	`coverage_starts_at` text,
	`complete_through` text,
	`last_started_at` text,
	`last_succeeded_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "unifi_access_sync_state_singleton_check" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `unifi_actor_links` (
	`controller_actor_id` text PRIMARY KEY,
	`actor_type` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`household_id` text,
	`label` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'current' NOT NULL,
	`linked_at` text NOT NULL,
	`retired_at` text,
	CONSTRAINT `fk_unifi_actor_links_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT OR IGNORE INTO `unifi_actor_links` (`controller_actor_id`, `actor_type`, `subject_type`, `subject_id`, `household_id`, `label`, `role`, `linked_at`)
SELECT `controller_visitor_id`, 'visitor', 'gate_code', `id`, `household_id`, `label`, 'current', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `gate_codes`;
--> statement-breakpoint
INSERT OR IGNORE INTO `unifi_actor_links` (`controller_actor_id`, `actor_type`, `subject_type`, `subject_id`, `household_id`, `label`, `role`, `linked_at`)
SELECT `controller_visitor_id`, 'visitor', 'credential', `id`, `household_id`, `label`, 'current', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `credentials`;
--> statement-breakpoint
CREATE INDEX `unifi_access_events_occurred_idx` ON `unifi_access_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `unifi_access_events_actor_occurred_idx` ON `unifi_access_events` (`actor_controller_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `unifi_access_events_result_occurred_idx` ON `unifi_access_events` (`result`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `unifi_actor_links_subject_idx` ON `unifi_actor_links` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `unifi_actor_links_household_idx` ON `unifi_actor_links` (`household_id`);
