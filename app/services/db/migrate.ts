import { appDataDir, exists, join, readTextFile, sqliteExecute, sqliteSelect } from "~/services/electron-client"

const MIGRATIONS_TABLE = "__drizzle_migrations"

type SqliteBridge = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>
  select: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>
}

let db: SqliteBridge | null = null

async function getDb() {
  if (!db) {
    const baseDir = await appDataDir()
    const dbPath = await join(baseDir, "memories.db")
    db = {
      execute: (sql, params = []) => sqliteExecute(dbPath, sql, params),
      select: (sql, params = []) => sqliteSelect(dbPath, sql, params),
    }
  }
  return db
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
  try {
    const result = await sqlite.select<{ name: string }>(`SELECT name FROM ${MIGRATIONS_TABLE}`)
    return result.map((r) => r.name)
  } catch {
    return []
  }
}

async function executeSql(sqlite: Awaited<ReturnType<typeof getDb>>, sql: string) {
  const statements = sql.split(/-->\s*statement-breakpoint/).filter((s) => s.trim())
  for (const stmt of statements) {
    const subStatements = stmt.split(";").filter((s) => s.trim())
    for (const subStmt of subStatements) {
      if (subStmt.trim()) {
        await sqlite.execute(subStmt)
      }
    }
  }
}

const MIGRATION_FILES = [
  "0000_lying_reavers.sql",
  "0001_fantastic_redwing.sql",
]

async function getMigrationsDir(): Promise<string> {
  const baseDir = await appDataDir()
  const possiblePaths = [
    await join(baseDir, "..", "..", "..", "drizzle"),
    await join(baseDir, "..", "..", "..", "..", "drizzle"),
    await join(baseDir, "..", "..", "..", "..", "..", "drizzle"),
  ]

  for (const p of possiblePaths) {
    try {
      if (await exists(p)) return p
    } catch {
      // keep searching
    }
  }

  return await join(baseDir, "..", "drizzle")
}

export async function runMigrations() {
  const sqlite = await getDb()
  await initMigrationsTable(sqlite)
  const applied = await getAppliedMigrations(sqlite)
  const migrationsDir = await getMigrationsDir()

  for (const fileName of MIGRATION_FILES) {
    if (applied.includes(fileName)) continue

    try {
      const filePath = await join(migrationsDir, fileName)
      if (!(await exists(filePath))) continue

      await executeSql(sqlite, await readTextFile(filePath))
      await sqlite.execute(
        `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES ($1, $2)`,
        [fileName, Date.now()]
      )
    } catch (error) {
      console.error(`[migrate] Failed to apply ${fileName}:`, error)
    }
  }
}
