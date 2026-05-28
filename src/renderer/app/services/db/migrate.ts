import {
  exists,
  join,
  readTextFile,
  sqliteExecute,
  sqliteSelect,
  getMigrationsDir,
} from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"

const MIGRATIONS_TABLE = "__drizzle_migrations"

type SqliteBridge = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>
  select: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<T[]>
}

type DrizzleJournal = {
  entries: { tag: string }[]
}

let db: SqliteBridge | null = null
let migratePromise: Promise<void> | null = null

async function getDb() {
  if (!db) {
    const { databaseFile: dbPath } = await getStoragePaths()
    db = {
      execute: (sql, params = []) => sqliteExecute(dbPath, sql, params),
      select: (sql, params = []) => sqliteSelect(dbPath, sql, params),
    }
  }
  return db
}

export function resetMigrateDbCache() {
  db = null
  migratePromise = null
}

async function initMigrationsTable(sqlite: Awaited<ReturnType<typeof getDb>>) {
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)
}

async function getAppliedMigrations(sqlite: Awaited<ReturnType<typeof getDb>>) {
  const result = await sqlite.select<{ name: string }>(
    `SELECT name FROM ${MIGRATIONS_TABLE}`
  )
  return result.map((r) => r.name)
}

function ensureCreateIfNotExists(sql: string): string {
  const trimmed = sql.trim()
  if (/^CREATE\s+INDEX\s+/i.test(trimmed) && !/IF\s+NOT\s+EXISTS/i.test(trimmed)) {
    return trimmed.replace(/^CREATE\s+INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ")
  }
  if (
    /^CREATE\s+UNIQUE\s+INDEX\s+/i.test(trimmed) &&
    !/IF\s+NOT\s+EXISTS/i.test(trimmed)
  ) {
    return trimmed.replace(
      /^CREATE\s+UNIQUE\s+INDEX\s+/i,
      "CREATE UNIQUE INDEX IF NOT EXISTS "
    )
  }
  return trimmed
}

async function executeSql(
  sqlite: Awaited<ReturnType<typeof getDb>>,
  sql: string
) {
  const statements = sql
    .split(/-->\s*statement-breakpoint/)
    .filter((s) => s.trim())
  for (const stmt of statements) {
    for (const subStmt of stmt.split(";").filter((s) => s.trim())) {
      await sqlite.execute(ensureCreateIfNotExists(subStmt))
    }
  }
}

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const journalPath = await join(migrationsDir, "meta", "_journal.json")
  if (!(await exists(journalPath))) return []
  const raw = await readTextFile(journalPath)
  const journal = JSON.parse(raw) as DrizzleJournal
  return journal.entries.map((entry) => `${entry.tag}.sql`)
}

async function runMigrationsInternal() {
  const sqlite = await getDb()
  await initMigrationsTable(sqlite)

  const applied = new Set(await getAppliedMigrations(sqlite))
  const migrationsDir = await getMigrationsDir()

  for (const fileName of await listMigrationFiles(migrationsDir)) {
    if (applied.has(fileName)) continue

    const filePath = await join(migrationsDir, fileName)
    if (!(await exists(filePath))) continue

    await executeSql(sqlite, await readTextFile(filePath))
    await sqlite.execute(
      `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`,
      [fileName, Date.now()]
    )
    applied.add(fileName)
  }
}

/** 应用启动时自动执行（空库会按 drizzle journal 顺序建表） */
export async function runMigrations() {
  if (migratePromise) return migratePromise
  migratePromise = runMigrationsInternal().catch((error) => {
    migratePromise = null
    throw error
  })
  return migratePromise
}
