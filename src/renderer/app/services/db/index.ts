import { drizzle } from "drizzle-orm/sqlite-proxy"
import { sqliteExecute, sqliteSelect } from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"
import { ensureVectorTables } from "~/services/vector-store"
import { runMigrations } from "./migrate"
import * as schema from "./schema"

type SqliteBridge = {
  execute: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: unknown[]; lastInsertRowid: number; changes: number }>
  select: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<T[]>
}

let db: ReturnType<typeof drizzle> | null = null
let sqliteDb: SqliteBridge | null = null
let initPromise: Promise<void> | null = null

export function resetDbCache() {
  db = null
  sqliteDb = null
  initPromise = null
}

async function getSqliteDb(): Promise<SqliteBridge> {
  if (!sqliteDb) {
    const { databaseFile: dbPath } = await getStoragePaths()
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

    const vectorSchema = await ensureVectorTables()
    if (vectorSchema.mode === "fallback") {
      console.warn(
        "[db] sqlite-vec 不可用，已启用 BLOB 向量降级表（检索仍可用，性能略低）"
      )
    }
  })()

  await initPromise
}

async function sqliteProxy(
  sql: string,
  params: unknown[],
  method: "all" | "run" | "get" | "values"
) {
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
        const result = await sqliteProxy(
          sql,
          params,
          method as "all" | "run" | "get" | "values"
        )
        if (Array.isArray(result)) {
          return {
            rows: result as unknown as {}[],
            lastInsertRowid: 0,
            changes: 0,
          }
        }
        return {
          rows: [],
          lastInsertRowid: result.lastInsertRowid,
          changes: result.changes,
        }
      },
      { schema }
    )
  }
  return db
}

export { getSqliteDb, schema }
