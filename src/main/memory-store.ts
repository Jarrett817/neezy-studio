import fs from "node:fs/promises"
import path from "node:path"
import { app } from "electron"

import * as embeddingRuntime from "./embedding-runtime"
import { log } from "./logger"
import { resolveStoragePaths } from "./storage-paths"
import {
  ensureVectorSchema,
  getEntry,
  libsqlVector,
  runStatement,
  selectStatement,
} from "./sqlite-runtime"

export interface MemoryItemRow {
  id: string
  title: string
  category: string
  content: string
  file_path: string
  created_at: number
  updated_at: number
}

function memoryPaths(): { databaseFile: string; memoriesDir: string } {
  const p = resolveStoragePaths(app)
  return { databaseFile: p.databaseFile, memoriesDir: p.memoriesDir }
}

function newMemoryId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 21)
}

function memoryFileName(title: string, now: number): string {
  const safeTitle = String(title ?? "")
    .replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
  return `${safeTitle || "memory"}_${now}.md`
}

function formatHit(row: Record<string, unknown>): string {
  return `[${String(row.category)}] ${String(row.title)}\n${String(row.content)}`
}

async function keywordSearch(
  query: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (terms.length === 0) return []

  const { databaseFile } = memoryPaths()
  const rows = await selectStatement(
    databaseFile,
    `SELECT id, title, category, content, file_path, created_at, updated_at
     FROM memory_items
     ORDER BY updated_at DESC
     LIMIT 200`
  )

  return rows
    .map((row) => {
      const text = `${row.title} ${row.category} ${row.content}`.toLowerCase()
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0)
      return { row, score }
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.row.updated_at) - Number(a.row.updated_at)
    )
    .slice(0, limit)
    .map(({ row }) => row)
}

export async function searchMemoryItems(
  query: string,
  limit = 8
): Promise<{ text: string; count: number }> {
  const q = query.trim()
  if (!q) return { text: "请提供搜索关键词", count: 0 }

  const { databaseFile } = memoryPaths()
  await ensureVectorSchema(databaseFile)
  const { client } = getEntry(databaseFile)

  try {
    const embedding = (await embeddingRuntime.embedTexts(q, "query")) as number[]
    if (embedding.length > 0) {
      const rows = await libsqlVector.searchMemories(client, embedding, limit)
      if (rows.length > 0) {
        return {
          text: rows.map(formatHit).join("\n\n"),
          count: rows.length,
        }
      }
    }
  } catch (err) {
    log.warn("[memory-store] vector search failed:", err)
  }

  const fallback = await keywordSearch(q, limit)
  if (fallback.length === 0) {
    return { text: "记忆中未找到相关内容", count: 0 }
  }
  return {
    text: fallback.map(formatHit).join("\n\n"),
    count: fallback.length,
  }
}

export async function saveMemoryItem(item: {
  title: string
  content: string
  category?: string
  id?: string
  fileName?: string
}): Promise<MemoryItemRow> {
  const title = item.title.trim()
  const content = item.content.trim()
  if (!title || !content) {
    throw new Error("记忆标题与内容不能为空")
  }

  const { memoriesDir, databaseFile } = memoryPaths()
  await fs.mkdir(memoriesDir, { recursive: true })

  const now = Date.now()
  const id = item.id ?? newMemoryId()
  const category = item.category?.trim() || "记忆"
  const fileName = item.fileName ?? memoryFileName(title, now)
  const filePath = path.join(memoriesDir, fileName)

  await fs.writeFile(filePath, `# ${title}\n\n${content}`, "utf8")
  await runStatement(
    databaseFile,
    `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       category = excluded.category,
       content = excluded.content,
       file_path = excluded.file_path,
       updated_at = excluded.updated_at`,
    [id, title, category, content, filePath, now, now]
  )

  await ensureVectorSchema(databaseFile)
  try {
    const embedding = (await embeddingRuntime.embedTexts(
      `${title} ${content}`,
      "document"
    )) as number[]
    if (embedding.length > 0) {
      const { client } = getEntry(databaseFile)
      await libsqlVector.upsertMemoryEmbedding(client, id, embedding)
    }
  } catch (err) {
    log.warn("[memory-store] embedding upsert failed:", err)
  }

  return {
    id,
    title,
    content,
    category,
    file_path: filePath,
    created_at: now,
    updated_at: now,
  }
}
