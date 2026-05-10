// Drizzle + tauri-plugin-sql integration

import Database from "@tauri-apps/plugin-sql"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { appDataDir } from "@tauri-apps/api/path"
import { runMigrations } from "./migrate"
import * as schema from "./schema"

let db: ReturnType<typeof drizzle> | null = null
let sqliteDb: Awaited<ReturnType<typeof Database.load>> | null = null
let initPromise: Promise<void> | null = null

// 获取数据库完整路径（跨平台：Win: %APPDATA%/com.neezy.studio/memories.db, Mac: ~/Library/Application Support/com.neezy.studio/memories.db）
async function getDbPath() {
  const baseDir = await appDataDir()
  // appDataDir 返回的路径已经区分平台：Win/Mac/Linux 各不相同
  return `${baseDir}/memories.db`
}

// 获取 tauri-plugin-sql 数据库实例
async function getSqliteDb() {
  if (!sqliteDb) {
    const dbPath = await getDbPath()
    sqliteDb = await Database.load(`sqlite:${dbPath}`)
  }
  return sqliteDb
}

// 确保数据库已初始化（应用迁移 + 创建 vec0 向量表）
// 只在浏览器环境中执行，使用 Promise 缓存防止并发初始化
export async function ensureInit() {
  if (typeof window === "undefined") return
  if (initPromise) return initPromise

  initPromise = (async () => {
    // 运行 drizzle 迁移
    await runMigrations()

    // 创建 sqlite-vec 向量表
    const sqlite = await getSqliteDb()

    // 检查 vec0 扩展是否可用（尝试执行简单查询）
    try {
      await sqlite.execute("SELECT 1")
    } catch {
      console.warn("[db] vec0 extension may not be loaded, creating tables anyway")
    }

    await sqlite.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[768]
      )
    `)
    await sqlite.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vector_slices USING vec0(
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        session_id TEXT,
        memory_type TEXT NOT NULL,
        embedding FLOAT[768]
      )
    `)
  })()

  await initPromise
}

// SQLite proxy that wraps tauri-plugin-sql for drizzle
async function sqliteProxy(sql: string, params: unknown[], method: "all" | "run" | "get" | "values") {
  const sqlite = await getSqliteDb()

  if (method === "all" || method === "get" || method === "values") {
    const rows = await sqlite.select(sql, params as string[])
    return rows
  } else {
    await sqlite.execute(sql, params as string[])
    return { rows: [], lastInsertRowid: 0, changes: 0 }
  }
}

export function getDb() {
  if (!db) {
    db = drizzle(
      async (sql, params, method) => {
        const result = await sqliteProxy(sql, params, method as "all" | "run" | "get" | "values")
        return { rows: result as unknown as {}[], lastInsertRowid: 0, changes: 0 }
      },
      { schema }
    )
  }
  return db
}

export { getSqliteDb, schema }
