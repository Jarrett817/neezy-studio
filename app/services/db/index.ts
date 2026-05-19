import { drizzle } from "drizzle-orm/sqlite-proxy"
import { appDataDir, join, sqliteExecute, sqliteSelect } from "~/services/electron-client"
import { runMigrations } from "./migrate"
import * as schema from "./schema"

type SqliteBridge = {
  execute: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; lastInsertRowid: number; changes: number }>
  select: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>
}

let db: ReturnType<typeof drizzle> | null = null
let sqliteDb: SqliteBridge | null = null
let initPromise: Promise<void> | null = null

async function getDbPath() {
  const baseDir = await appDataDir()
  return join(baseDir, "memories.db")
}

async function getSqliteDb(): Promise<SqliteBridge> {
  if (!sqliteDb) {
    const dbPath = await getDbPath()
    sqliteDb = {
      execute: (sql, params = []) => sqliteExecute(dbPath, sql, params),
      select: (sql, params = []) => sqliteSelect(dbPath, sql, params),
    }
  }
  return sqliteDb
}

export async function ensureInit() {
  if (typeof window === "undefined") return
  if (initPromise) return initPromise

  initPromise = (async () => {
    await runMigrations()

    const sqlite = await getSqliteDb()
    await sqlite.execute("SELECT 1")

    try {
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
    } catch (error) {
      console.warn("[db] sqlite-vec is not available in the Electron runtime; vector search is disabled.", error)
    }
  })()

  await initPromise
}

async function sqliteProxy(sql: string, params: unknown[], method: "all" | "run" | "get" | "values") {
  const sqlite = await getSqliteDb()

  if (method === "all" || method === "get" || method === "values") {
    return sqlite.select(sql, params)
  }

  return sqlite.execute(sql, params)
}

export function getDb() {
  if (!db) {
    db = drizzle(
      async (sql, params, method) => {
        const result = await sqliteProxy(sql, params, method as "all" | "run" | "get" | "values")
        if (Array.isArray(result)) {
          return { rows: result as unknown as {}[], lastInsertRowid: 0, changes: 0 }
        }
        return { rows: [], lastInsertRowid: result.lastInsertRowid, changes: result.changes }
      },
      { schema }
    )
  }
  return db
}

export { getSqliteDb, schema }
