import { EMBEDDING_DIM } from "./types"

export type SqliteDb = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...params: unknown[]) => void
    all: (...params: unknown[]) => unknown[]
  }
}

export { EMBEDDING_DIM }

export function ensureFallbackTables(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings_fallback (
      id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_vector_slices_fallback (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      session_id TEXT,
      memory_type TEXT NOT NULL,
      embedding BLOB NOT NULL
    )
  `)
}

function toBlob(embedding: number[] | Float32Array): Uint8Array {
  const arr = Array.isArray(embedding) ? new Float32Array(embedding) : embedding
  return new Uint8Array(arr.buffer)
}

function fromBlob(blob: Uint8Array | ArrayBuffer): Float32Array {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob)
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}

function cosine(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export function upsertMemoryEmbedding(
  db: SqliteDb,
  id: string,
  embedding: number[]
): void {
  db.prepare(
    `INSERT OR REPLACE INTO memory_embeddings_fallback (id, embedding) VALUES (?, ?)`
  ).run(id, toBlob(embedding))
}

export function deleteMemoryEmbedding(db: SqliteDb, id: string): void {
  db.prepare(`DELETE FROM memory_embeddings_fallback WHERE id = ?`).run(id)
}

export function searchMemories(
  db: SqliteDb,
  queryEmbedding: number[],
  limit: number
): Record<string, unknown>[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.category, m.content, m.file_path, m.created_at, m.updated_at, e.embedding
       FROM memory_items m
       INNER JOIN memory_embeddings_fallback e ON m.id = e.id`
    )
    .all() as (Record<string, unknown> & { embedding: Uint8Array })[]

  const query = new Float32Array(queryEmbedding)
  return rows
    .map((row) => ({
      row,
      score: cosine(query, fromBlob(row.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      content: row.content,
      file_path: row.file_path,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
}

export function upsertMemorySlice(
  db: SqliteDb,
  id: string,
  content: string,
  sessionId: string | null,
  memoryType: string,
  embedding: number[]
): void {
  db.prepare(
    `INSERT OR REPLACE INTO memory_vector_slices_fallback
     (id, content, session_id, memory_type, embedding) VALUES (?, ?, ?, ?, ?)`
  ).run(id, content, sessionId, memoryType, toBlob(embedding))
}

export function searchMemorySlices(
  db: SqliteDb,
  queryEmbedding: number[],
  limit: number,
  memoryType: string | null
): Record<string, unknown>[] {
  let sql = `
    SELECT m.id, m.session_id, m.memory_type, m.content_preview, m.created_at, f.content, f.embedding
    FROM memory_slice_metadata m
    INNER JOIN memory_vector_slices_fallback f ON m.id = f.id
  `
  const params: unknown[] = []
  if (memoryType) {
    sql += ` WHERE f.memory_type = ?`
    params.push(memoryType)
  }
  const rows = db.prepare(sql).all(...params) as (Record<string, unknown> & {
    embedding: Uint8Array
  })[]

  const query = new Float32Array(queryEmbedding)
  return rows
    .map((row) => ({
      row,
      score: cosine(query, fromBlob(row.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => ({
      id: row.id,
      session_id: row.session_id,
      memory_type: row.memory_type,
      content: row.content,
      content_preview: row.content_preview,
      created_at: row.created_at,
    }))
}
