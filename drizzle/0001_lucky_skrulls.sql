CREATE TABLE `auth_transactions` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`nonce` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_transactions_expiry` ON `auth_transactions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `auth_kind` text DEFAULT 'anonymous' NOT NULL;