PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_preview` text
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "title", "created_at", "updated_at", "message_count", "last_message_preview") SELECT "id", "title", "created_at", "updated_at", "message_count", "last_message_preview" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;