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
let dbReadyPromise: Promise<void> | null = null

export function resetDbCache() {
  db = null
  sqliteDb = null
  initPromise = null
  dbReadyPromise = null
}

function createSqliteBridge(): SqliteBridge {
  return {
    execute: async (sql, params = []) => {
      const { databaseFile: dbPath } = await getStoragePaths()
      return sqliteExecute(dbPath, sql, params)
    },
    select: async (sql, params = []) => {
      const { databaseFile: dbPath } = await getStoragePaths()
      return sqliteSelect(dbPath, sql, params)
    },
  }
}

async function getSqliteDb(): Promise<SqliteBridge> {
  if (!sqliteDb) sqliteDb = createSqliteBridge()
  return sqliteDb
}

/** 迁移 + 连通性（对话/会话读取依赖此项，不阻塞于向量表） */
export async function ensureDbReady() {
  if (typeof window === "undefined") return
  if (dbReadyPromise) return dbReadyPromise

  dbReadyPromise = (async () => {
    await runMigrations()
    const sqlite = await getSqliteDb()
    await sqlite.execute("SELECT 1")
  })().catch((error) => {
    dbReadyPromise = null
    throw error
  })

  await dbReadyPromise
}

export async function ensureInit() {
  if (typeof window === "undefined") return
  if (initPromise) return initPromise

  initPromise = (async () => {
    await ensureDbReady()
    try {
      const vectorSchema = await ensureVectorTables()
      if (vectorSchema.mode !== "libsql") {
        console.warn("[db] 向量表未按 libsql 原生模式初始化:", vectorSchema.mode)
      }
    } catch (error) {
      console.warn("[db] 向量表初始化失败（对话仍可保存）:", error)
    }
  })().catch((error) => {
    initPromise = null
    throw error
  })

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
