CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`thinking` text DEFAULT '' NOT NULL,
	`tool_calls_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_messages_session_id_created_at_idx` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `memory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '记忆' NOT NULL,
	`content` text NOT NULL,
	`file_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_slice_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`memory_type` text NOT NULL,
	`content_preview` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_preview` text
);
