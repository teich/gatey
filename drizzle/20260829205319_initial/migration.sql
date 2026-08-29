-- Gatey was pre-production when Drizzle became the schema source of truth.
-- This baseline intentionally discards the earlier prototype schema and data.
DROP TABLE IF EXISTS `twilio_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `twilio_action_attempts`;--> statement-breakpoint
DROP TABLE IF EXISTS `user_phone_numbers`;--> statement-breakpoint
DROP TABLE IF EXISTS `unifi_service_accounts`;--> statement-breakpoint
DROP TABLE IF EXISTS `gate_codes`;--> statement-breakpoint
DROP TABLE IF EXISTS `party_mode`;--> statement-breakpoint
DROP TABLE IF EXISTS `audit_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `visitor_households`;--> statement-breakpoint
DROP TABLE IF EXISTS `unifi_person_links`;--> statement-breakpoint
DROP TABLE IF EXISTS `visitor_pins`;--> statement-breakpoint
DROP TABLE IF EXISTS `person_pins`;--> statement-breakpoint
DROP TABLE IF EXISTS `credentials`;--> statement-breakpoint
DROP TABLE IF EXISTS `invitation`;--> statement-breakpoint
DROP TABLE IF EXISTS `member`;--> statement-breakpoint
DROP TABLE IF EXISTS `account`;--> statement-breakpoint
DROP TABLE IF EXISTS `session`;--> statement-breakpoint
DROP TABLE IF EXISTS `verification`;--> statement-breakpoint
DROP TABLE IF EXISTS `organization`;--> statement-breakpoint
DROP TABLE IF EXISTS `user`;--> statement-breakpoint
DROP TABLE IF EXISTS `schema_migrations`;--> statement-breakpoint

CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`issuer` text NOT NULL,
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
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY,
	`occurred_at` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`household_id` text,
	`household_name` text,
	`action` text NOT NULL,
	`outcome` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "audit_events_outcome_check" CHECK("outcome" in ('succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`label` text NOT NULL,
	`pin` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`controller_visitor_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_credentials_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `gate_codes` (
	`id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`label` text NOT NULL,
	`pin` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`controller_ends_at` text NOT NULL,
	`controller_visitor_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`disabled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_gate_codes_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "gate_codes_kind_check" CHECK("kind" in ('home', 'ongoing', 'temporary')),
	CONSTRAINT "gate_codes_state_check" CHECK("state" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	CONSTRAINT `fk_invitation_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_invitation_inviter_id_user_id_fk` FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_member_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `party_mode` (
	`id` integer PRIMARY KEY,
	`state` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`household_id` text NOT NULL,
	`household_name` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_party_mode_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "party_mode_singleton_check" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `person_pins` (
	`controller_user_id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`label` text NOT NULL,
	`pin` text NOT NULL,
	`replaced_at` text NOT NULL,
	CONSTRAINT `fk_person_pins_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	`impersonated_by` text,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `twilio_action_attempts` (
	`id` text PRIMARY KEY,
	`call_sid` text NOT NULL,
	`action` text NOT NULL,
	`caller_e164` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`household_id` text NOT NULL,
	`household_name` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`detail` text DEFAULT '' NOT NULL,
	CONSTRAINT "twilio_action_attempts_action_check" CHECK("action" in ('open', 'hold_open')),
	CONSTRAINT "twilio_action_attempts_status_check" CHECK("status" in ('pending', 'succeeded', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE `twilio_events` (
	`id` text PRIMARY KEY,
	`occurred_at` text NOT NULL,
	`call_sid` text DEFAULT '' NOT NULL,
	`caller_e164` text DEFAULT '' NOT NULL,
	`event` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`actor_user_id` text,
	`household_id` text
);
--> statement-breakpoint
CREATE TABLE `unifi_person_links` (
	`controller_user_id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`linked_at` text NOT NULL,
	CONSTRAINT `fk_unifi_person_links_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `unifi_service_accounts` (
	`controller_user_id` text PRIMARY KEY,
	`label` text NOT NULL,
	`marked_at` text NOT NULL,
	`marked_by_user_id` text NOT NULL,
	`marked_by_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`username` text,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE TABLE `user_phone_numbers` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`phone_e164` text NOT NULL,
	`label` text DEFAULT 'Mobile' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`can_open` integer DEFAULT true NOT NULL,
	`can_hold_open` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_user_phone_numbers_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visitor_households` (
	`controller_visitor_id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	CONSTRAINT `fk_visitor_households_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `visitor_pins` (
	`controller_visitor_id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`label` text NOT NULL,
	`pin` text NOT NULL,
	`replaced_at` text NOT NULL,
	CONSTRAINT `fk_visitor_pins_household_id_organization_id_fk` FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_account_id_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `audit_events_occurred_at_idx` ON `audit_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_household_occurred_at_idx` ON `audit_events` (`household_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_controller_visitor_id_uidx` ON `credentials` (`controller_visitor_id`);--> statement-breakpoint
CREATE INDEX `credentials_household_state_end_idx` ON `credentials` (`household_id`,`state`,`ends_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `gate_codes_controller_visitor_id_uidx` ON `gate_codes` (`controller_visitor_id`);--> statement-breakpoint
CREATE INDEX `gate_codes_household_state_kind_idx` ON `gate_codes` (`household_id`,`state`,`kind`);--> statement-breakpoint
CREATE INDEX `invitation_organization_id_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE INDEX `member_organization_id_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_user_id_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_uidx` ON `organization` (`slug`);--> statement-breakpoint
CREATE INDEX `party_mode_state_end_idx` ON `party_mode` (`state`,`ends_at`);--> statement-breakpoint
CREATE INDEX `person_pins_household_idx` ON `person_pins` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_uidx` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `twilio_action_attempts_call_action_uidx` ON `twilio_action_attempts` (`call_sid`,`action`);--> statement-breakpoint
CREATE INDEX `twilio_action_attempts_requested_idx` ON `twilio_action_attempts` (`requested_at`);--> statement-breakpoint
CREATE INDEX `twilio_events_occurred_idx` ON `twilio_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `twilio_events_call_idx` ON `twilio_events` (`call_sid`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `unifi_person_links_user_uidx` ON `unifi_person_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `unifi_service_accounts_marked_at_idx` ON `unifi_service_accounts` (`marked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_uidx` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_uidx` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_numbers_phone_e164_uidx` ON `user_phone_numbers` (`phone_e164`);--> statement-breakpoint
CREATE INDEX `user_phone_numbers_user_idx` ON `user_phone_numbers` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `visitor_households_household_idx` ON `visitor_households` (`household_id`);--> statement-breakpoint
CREATE INDEX `visitor_pins_household_idx` ON `visitor_pins` (`household_id`);
--> statement-breakpoint
INSERT INTO `organization` (`id`, `name`, `slug`, `logo`, `created_at`, `metadata`)
VALUES ('oren-home', 'Bennett Valley Gate', 'oren-home', NULL, CAST(unixepoch('subsecond') * 1000 AS integer), NULL);
