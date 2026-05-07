CREATE VIRTUAL TABLE IF NOT EXISTS memory_vector_slices USING vec0(
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  session_id TEXT,
  memory_type TEXT NOT NULL,
  embedding FLOAT[1024]
);

CREATE TABLE IF NOT EXISTS memory_slice_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT,
  memory_type TEXT NOT NULL,
  content_preview TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
