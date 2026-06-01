// 记忆存储服务 - Drizzle ORM + Electron SQLite

import { nanoid } from "nanoid"
import { ensureInit, getDb, schema } from "./db"
import {
  deleteMemoryEmbedding,
  searchMemoriesByVector,
  upsertMemoryEmbedding,
} from "~/services/vector-store"
import { writeMemoryFile, deleteMemoryFile } from "./fs-memory"
import { selectSqliteRows } from "./storage/sqlite-rows"
import { eq } from "drizzle-orm"
import {
  isKnowledgeCategory,
  isMemoryPanelCategory,
  MEMORY_CATEGORY,
  type MemoryCategory,
} from "~/config/memory-categories"
import { getEmbeddings } from "./llm"

export type MemoryItem = {
  id: string
  title: string
  content: string
  category: string
  file_path: string
  created_at: number
  updated_at: number
}

type MemoryItemRow = {
  id: string
  title: string | null
  category: string | null
  content: string | null
  file_path: string | null
  created_at: number | string | null
  updated_at: number | string | null
}

function rowToMemoryItem(row: MemoryItemRow): MemoryItem {
  const updatedAt = Number(row.updated_at) || Number(row.created_at) || 0
  const createdAt = Number(row.created_at) || updatedAt
  const category =
    typeof row.category === "string" && row.category.trim()
      ? row.category.trim()
      : "记忆"
  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    category,
    file_path: typeof row.file_path === "string" ? row.file_path : "",
    created_at: createdAt,
    updated_at: updatedAt,
  }
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
  await db
    .insert(schema.memoryItems)
    .values({
      id,
      title: item.title,
      category,
      content: item.content,
      file_path,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
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
      await upsertMemoryEmbedding(id, embedding)
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

// 列出所有记忆（直读 SQLite，避免 drizzle sqlite-proxy 经 IPC 丢字段）
export async function listMemories(): Promise<MemoryItem[]> {
  await ensureInit()
  const rows = await selectSqliteRows<MemoryItemRow>(
    `SELECT id, title, category, content, file_path, created_at, updated_at
     FROM memory_items
     ORDER BY updated_at DESC`
  )
  return rows.map(rowToMemoryItem)
}

export async function listMemoriesByCategory(
  category: MemoryCategory
): Promise<MemoryItem[]> {
  const all = await listMemories()
  const match =
    category === MEMORY_CATEGORY.KNOWLEDGE
      ? isKnowledgeCategory
      : isMemoryPanelCategory
  return all.filter((item) => match(item.category))
}

export async function searchMemoriesScoped(
  query: string,
  options?: { limit?: number; category?: string }
): Promise<MemoryItem[]> {
  const limit = options?.limit ?? 10
  const results = await searchMemories(query, limit * 3)
  if (!options?.category) return results.slice(0, limit)
  const match =
    options.category === MEMORY_CATEGORY.KNOWLEDGE
      ? isKnowledgeCategory
      : isMemoryPanelCategory
  return results.filter((item) => match(item.category)).slice(0, limit)
}

// 删除记忆
export async function deleteMemory(
  id: string,
  filePath: string
): Promise<void> {
  await ensureInit()
  // 前端直接删除 MD 文件
  await deleteMemoryFile(filePath)

  // 删除 SQLite 记录 via Drizzle
  const db = getDb()
  await db.delete(schema.memoryItems).where(eq(schema.memoryItems.id, id))

  // 删除向量
  try {
    await deleteMemoryEmbedding(id)
  } catch (e) {
    console.warn("Failed to delete embedding:", e)
  }
}

// 向量搜索
export async function searchMemories(
  query: string,
  limit = 10
): Promise<MemoryItem[]> {
  await ensureInit()

  const fallbackSearch = async () => {
    const all = await listMemories()
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)

    return all
      .map((item) => {
        const text =
          `${item.title} ${item.category} ${item.content}`.toLowerCase()
        const score = terms.reduce(
          (sum, term) => sum + (text.includes(term) ? 1 : 0),
          0
        )
        return { item, score }
      })
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) => b.score - a.score || b.item.updated_at - a.item.updated_at
      )
      .slice(0, limit)
      .map(({ item }) => item)
  }

  // 生成查询向量
  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await getEmbeddings(query, { purpose: "query" })
  } catch (e) {
    console.warn("Failed to generate query embedding:", e)
    return fallbackSearch()
  }

  if (!queryEmbedding || queryEmbedding.length === 0) return fallbackSearch()

  try {
    const rows = await searchMemoriesByVector(queryEmbedding, limit)
    return rows.map((row) => rowToMemoryItem(row))
  } catch (e) {
    console.warn("Vector search failed, using text fallback:", e)
    return fallbackSearch()
  }
}
