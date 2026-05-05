// 记忆存储服务 - 前端 via tauri-plugin-sql + tauri-plugin-fs
// schema 由 Rust 迁移管理 (src-tauri/src/main.rs)

import Database from "@tauri-apps/plugin-sql"
import { nanoid } from "nanoid"
import { ensureMemoriesDir, writeMemoryFile, deleteMemoryFile } from "./fs-memory"

let db: Database | null = null

export type MemoryItem = {
  id: string
  title: string
  content: string
  category: string
  file_path: string
  created_at: number
  updated_at: number
}

// 获取数据库实例（schema 由 Rust 迁移管理）
export async function getDb(): Promise<Database> {
  if (!db) {
    // 使用相对路径，与 Rust 迁移路径一致
    db = await Database.load("sqlite:memories.db")
  }
  return db
}

// 保存记忆（写 MD 文件 + 写 SQLite）
export async function saveMemory(item: {
  title: string
  content: string
  category?: string
  id?: string
}): Promise<MemoryItem> {
  const database = await getDb()
  const id = item.id || nanoid(21)
  const now = Date.now()

  // 前端直接写 MD 文件
  const { file_path } = await writeMemoryFile(item.title, item.content)
  const category = item.category || "记忆"

  // 写入 SQLite
  await database.execute(
    `INSERT OR REPLACE INTO memory_items (id, title, category, content, file_path, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, item.title, category, item.content, file_path, now, now]
  )

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
  const database = await getDb()
  const result = await database.select<MemoryItem[]>(
    `SELECT id, title, category, content, file_path, created_at, updated_at
     FROM memory_items ORDER BY created_at DESC`
  )
  return result
}

// 删除记忆
export async function deleteMemory(id: string, filePath: string): Promise<void> {
  const database = await getDb()

  // 前端直接删除 MD 文件
  await deleteMemoryFile(filePath)

  // 删除 SQLite 记录
  await database.execute(`DELETE FROM memory_items WHERE id = $1`, [id])
}

// 全文搜索
export async function searchMemories(query: string, limit = 10): Promise<MemoryItem[]> {
  const database = await getDb()
  const result = await database.select<MemoryItem[]>(
    `SELECT m.id, m.title, m.category, m.content, m.file_path, m.created_at, m.updated_at
     FROM memory_items m
     JOIN memory_fts f ON m.rowid = f.rowid
     WHERE memory_fts MATCH $1
     LIMIT $2`,
    [query, limit]
  )
  return result
}
