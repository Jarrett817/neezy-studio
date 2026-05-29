DROP TABLE IF EXISTS `memory_embeddings_fallback`;
--> statement-breakpoint
DROP TABLE IF EXISTS `memory_vector_slices_fallback`;
--> statement-breakpoint
DROP TABLE IF EXISTS `memory_embeddings`;
--> statement-breakpoint
DROP TABLE IF EXISTS `memory_vector_slices`;
--> statement-breakpoint
CREATE TABLE `memory_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`embedding` F32_BLOB(384) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memory_embeddings_vec_idx` ON `memory_embeddings` (libsql_vector_idx(embedding, 'metric=cosine'));
--> statement-breakpoint
CREATE TABLE `memory_vector_slices` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`session_id` text,
	`memory_type` text NOT NULL,
	`embedding` F32_BLOB(384) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memory_vector_slices_vec_idx` ON `memory_vector_slices` (libsql_vector_idx(embedding, 'metric=cosine'));
