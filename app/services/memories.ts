// 记忆存储服务 - Drizzle ORM + tauri-plugin-sql + sqlite-vec

import { nanoid } from "nanoid"
import { ensureInit, getDb, getSqliteDb, schema } from "./db"
import { writeMemoryFile, deleteMemoryFile } from "./fs-memory"
import { eq } from "drizzle-orm"
import { getEmbeddings } from "./webllm"

export type MemoryItem = {
  id: string
  title: string
  content: string
  category: string
  file_path: string
  created_at: number
  updated_at: number
}

// 保存记忆（写 MD 文件 + 写 SQLite via Drizzle）
export async function saveMemory(item: {
  title: string
  content: string
  category?: string
  id?: string
}): Promise<MemoryItem> {
  await ensureInit()
  const db = getDb()
  const id = item.id || nanoid(21)
  const now = Date.now()

  // 前端直接写 MD 文件
  const { file_path } = await writeMemoryFile(item.title, item.content)
  const category = item.category || "记忆"

  // 写入 SQLite via Drizzle
  await db.insert(schema.memoryItems).values({
    id,
    title: item.title,
    category,
    content: item.content,
    file_path,
    created_at: now,
    updated_at: now,
  }).onConflictDoUpdate({
    target: schema.memoryItems.id,
    set: {
      title: item.title,
      category,
      content: item.content,
      file_path,
      updated_at: now,
    },
  })

  // 生成向量并存储
  try {
    const text = `${item.title} ${item.content}`
    const embedding = await getEmbeddings(text)
    if (embedding && embedding.length > 0) {
      const sqlite = await getSqliteDb()
      await sqlite.execute(
        `INSERT OR REPLACE INTO memory_embeddings (id, embedding) VALUES ($1, $2)`,
        [id, embedding]
      )
    }
  } catch (e) {
    console.warn("Failed to generate embedding:", e)
  }

  return {
    id,
    title: item.title,
    content: item.content,
    category,
    file_path,
    created_at: now,
    updated_at: now,
  }
}

// 列出所有记忆
export async function listMemories(): Promise<MemoryItem[]> {
  await ensureInit()
  const db = getDb()
  const result = await db.select().from(schema.memoryItems).orderBy(schema.memoryItems.created_at)
  return result
}

// 删除记忆
export async function deleteMemory(id: string, filePath: string): Promise<void> {
  await ensureInit()
  // 前端直接删除 MD 文件
  await deleteMemoryFile(filePath)

  // 删除 SQLite 记录 via Drizzle
  const db = getDb()
  await db.delete(schema.memoryItems).where(eq(schema.memoryItems.id, id))

  // 删除向量
  try {
    const sqlite = await getSqliteDb()
    await sqlite.execute(`DELETE FROM memory_embeddings WHERE id = $1`, [id])
  } catch (e) {
    console.warn("Failed to delete embedding:", e)
  }
}

// 向量搜索
export async function searchMemories(query: string, limit = 10): Promise<MemoryItem[]> {
  await ensureInit()

  // 生成查询向量
  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await getEmbeddings(query)
  } catch (e) {
    console.warn("Failed to generate query embedding:", e)
    return []
  }

  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const sqlite = await getSqliteDb()
  const results = await sqlite.select(
    `SELECT m.id, m.title, m.category, m.content, m.file_path, m.created_at, m.updated_at
     FROM memory_items m
     JOIN memory_embeddings e ON m.id = e.id
     WHERE e.embedding MATCH $1
     ORDER BY distance
     LIMIT $2`,
    [queryEmbedding, limit]
  )
  return results as MemoryItem[]
}