import type { Client } from "@libsql/client"

import { EMBEDDING_DIM } from "./types"

export { EMBEDDING_DIM }

function vecJson(embedding: number[]): string {
  return JSON.stringify(embedding)
}

async function ensureVecIndex(
  client: Client,
  indexName: string,
  table: string,
  column: string
): Promise<void> {
  try {
    await client.execute(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (libsql_vector_idx(${column}, 'metric=cosine'))`
    )
  } catch {
    /* 已存在或旧库结构不同时由 db:reset 处理 */
  }
}

/** 建 libsql 原生向量表（F32_BLOB + vector_idx） */
export async function ensureTables(client: Client): Promise<void> {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS memory_embeddings (
      id TEXT PRIMARY KEY NOT NULL,
      embedding F32_BLOB(${EMBEDDING_DIM}) NOT NULL
    )`
  )
  await client.execute(
    `CREATE TABLE IF NOT EXISTS memory_vector_slices (
      id TEXT PRIMARY KEY NOT NULL,
      content TEXT NOT NULL,
      session_id TEXT,
      memory_type TEXT NOT NULL,
      embedding F32_BLOB(${EMBEDDING_DIM}) NOT NULL
    )`
  )
  await ensureVecIndex(client, "memory_embeddings_vec_idx", "memory_embeddings", "embedding")
  await ensureVecIndex(
    client,
    "memory_vector_slices_vec_idx",
    "memory_vector_slices",
    "embedding"
  )
}

export async function upsertMemoryEmbedding(
  client: Client,
  id: string,
  embedding: number[]
): Promise<void> {
  await client.execute({
    sql: `INSERT OR REPLACE INTO memory_embeddings (id, embedding) VALUES (?, vector32(?))`,
    args: [id, vecJson(embedding)],
  })
}

export async function deleteMemoryEmbedding(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: `DELETE FROM memory_embeddings WHERE id = ?`,
    args: [id],
  })
}

export async function searchMemories(
  client: Client,
  queryEmbedding: number[],
  limit: number
): Promise<Record<string, unknown>[]> {
  const q = vecJson(queryEmbedding)
  const result = await client.execute({
    sql: `SELECT m.id, m.title, m.category, m.content, m.file_path, m.created_at, m.updated_at
     FROM memory_items m
     INNER JOIN memory_embeddings e ON m.id = e.id
     ORDER BY vector_distance_cos(e.embedding, vector32(?))
     LIMIT ?`,
    args: [q, limit],
  })
  return result.rows as Record<string, unknown>[]
}

export async function upsertMemorySlice(
  client: Client,
  id: string,
  content: string,
  sessionId: string | null,
  memoryType: string,
  embedding: number[]
): Promise<void> {
  await client.execute({
    sql: `INSERT OR REPLACE INTO memory_vector_slices (id, content, session_id, memory_type, embedding)
     VALUES (?, ?, ?, ?, vector32(?))`,
    args: [id, content, sessionId, memoryType, vecJson(embedding)],
  })
}

export async function searchMemorySlices(
  client: Client,
  queryEmbedding: number[],
  limit: number,
  memoryType: string | null
): Promise<Record<string, unknown>[]> {
  const q = vecJson(queryEmbedding)
  const base = `SELECT m.id, m.session_id, m.memory_type, m.content_preview, m.created_at, v.content
    FROM memory_slice_metadata m
    INNER JOIN memory_vector_slices v ON m.id = v.id`
  const order = ` ORDER BY vector_distance_cos(v.embedding, vector32(?)) LIMIT ?`

  if (memoryType) {
    const result = await client.execute({
      sql: `${base} WHERE m.memory_type = ?${order}`,
      args: [memoryType, q, limit],
    })
    return result.rows as Record<string, unknown>[]
  }

  const result = await client.execute({
    sql: `${base}${order}`,
    args: [q, limit],
  })
  return result.rows as Record<string, unknown>[]
}
