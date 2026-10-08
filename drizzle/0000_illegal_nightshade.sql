CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL,
	`last_command_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cases_owner_updated` ON `cases` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `commands` (
	`case_id` text NOT NULL,
	`command_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`result_revision` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `command_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`case_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`previous_hash` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `sequence`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`authority` text NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outbox_case` ON `outbox` (`case_id`);--> statement-breakpoint
CREATE INDEX `outbox_status_authority` ON `outbox` (`status`,`authority`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`role` text NOT NULL,
	`authority` text,
	`case_scope` text,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`authority` text NOT NULL,
	`status` text NOT NULL,
	`packet_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_authority_status` ON `tasks` (`authority`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_case` ON `tasks` (`case_id`);--> statement-breakpoint
CREATE TABLE `throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
