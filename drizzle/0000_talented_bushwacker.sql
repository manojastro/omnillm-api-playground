CREATE TABLE `provider_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`provider_id` text NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_provider_profiles_owner_updated` ON `provider_profiles` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_history` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`messages_json` text NOT NULL,
	`response_text` text NOT NULL,
	`status_code` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`usage_json` text,
	`request_json` text,
	`response_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_request_history_owner_created` ON `request_history` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_request_history_owner_provider` ON `request_history` (`owner_id`,`provider`);--> statement-breakpoint
PRAGMA optimize;
