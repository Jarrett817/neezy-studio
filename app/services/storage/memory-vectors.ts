// Memory vector storage service - Drizzle ORM + Electron SQLite

import { nanoid } from "nanoid"
import { ensureInit, getDb, getSqliteDb, schema } from "../db"
import { getEmbeddings } from "~/services/llm"

export type MemorySlice = {
  id: string
  session_id: string | null
  memory_type: "conversation" | "longterm" | "rag"
  content: string
  content_preview: string
  created_at: number
}

const CONTENT_PREVIEW_LENGTH = 200

function createContentPreview(content: string): string {
  return content.length > CONTENT_PREVIEW_LENGTH
    ? content.slice(0, CONTENT_PREVIEW_LENGTH) + "..."
    : content
}

async function insertMemoryVector(
  id: string,
  content: string,
  sessionId: string | null,
  memoryType: string
): Promise<void> {
  try {
    const embedding = await getEmbeddings(content)
    if (embedding && embedding.length > 0) {
      const sqlite = await getSqliteDb()
      await sqlite.execute(
        `INSERT INTO memory_vector_slices (id, content, session_id, memory_type, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, content, sessionId, memoryType, embedding]
      )
    }
  } catch (e) {
    console.warn(`Failed to generate embedding for ${memoryType} slice:`, e)
  }
}

// Add a conversation slice (chat history fragment)
export async function addConversationSlice(
  sessionId: string,
  content: string
): Promise<MemorySlice> {
  await ensureInit()
  const db = getDb()
  const id = nanoid(21)
  const now = Date.now()
  const content_preview = createContentPreview(content)

  await db.insert(schema.memorySlices).values({
    id,
    session_id: sessionId,
    memory_type: "conversation",
    content_preview,
    created_at: now,
  })

  await insertMemoryVector(id, content, sessionId, "conversation")

  return {
    id,
    session_id: sessionId,
    memory_type: "conversation",
    content,
    content_preview,
    created_at: now,
  }
}

// Add a long-term memory slice (cross-session, persistent)
export async function addLongtermMemory(content: string): Promise<MemorySlice> {
  await ensureInit()
  const db = getDb()
  const id = nanoid(21)
  const now = Date.now()
  const content_preview = createContentPreview(content)

  await db.insert(schema.memorySlices).values({
    id,
    session_id: null,
    memory_type: "longterm",
    content_preview,
    created_at: now,
  })

  await insertMemoryVector(id, content, null, "longterm")

  return {
    id,
    session_id: null,
    memory_type: "longterm",
    content,
    content_preview,
    created_at: now,
  }
}

// Add a RAG slice (retrievable knowledge)
export async function addRagSlice(content: string, sessionId?: string): Promise<MemorySlice> {
  await ensureInit()
  const db = getDb()
  const id = nanoid(21)
  const now = Date.now()
  const content_preview = createContentPreview(content)

  await db.insert(schema.memorySlices).values({
    id,
    session_id: sessionId ?? null,
    memory_type: "rag",
    content_preview,
    created_at: now,
  })

  await insertMemoryVector(id, content, sessionId ?? null, "rag")

  return {
    id,
    session_id: sessionId ?? null,
    memory_type: "rag",
    content,
    content_preview,
    created_at: now,
  }
}

// Semantic search across memory slices
export async function searchMemorySlices(
  query: string,
  limit = 10,
  type?: "conversation" | "longterm" | "rag"
): Promise<MemorySlice[]> {
  await ensureInit()
  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await getEmbeddings(query)
  } catch (e) {
    console.warn("Failed to generate query embedding:", e)
    return []
  }

  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const sqlite = await getSqliteDb()

  let sql = `
    SELECT m.id, m.session_id, m.memory_type, m.content_preview, m.created_at,
           v.content
    FROM memory_slice_metadata m
    JOIN memory_vector_slices v ON m.id = v.id
    WHERE v.embedding MATCH $1
  `
  const params: unknown[] = [queryEmbedding]

  if (type) {
    sql += ` AND m.memory_type = $${params.length + 1}`
    params.push(type)
  }

  sql += ` ORDER BY distance LIMIT $${params.length + 1}`
  params.push(String(limit))

  try {
    const rows = await sqlite.select<Record<string, unknown>>(sql, params)
    return rows.map((row): MemorySlice => ({
      id: row.id as string,
      session_id: row.session_id as string | null,
      memory_type: row.memory_type as MemorySlice["memory_type"],
      content: row.content as string,
      content_preview: row.content_preview as string,
      created_at: row.created_at as number,
    }))
  } catch (e) {
    console.warn("Failed to search memory slices:", e)
    return []
  }
}
