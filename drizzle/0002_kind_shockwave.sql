CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`thinking` text DEFAULT '' NOT NULL,
	`tool_calls_json` text,
	`created_at` integer NOT NULL
);
