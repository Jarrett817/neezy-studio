// 迁移运行器 - 读取 drizzle 生成的 SQL 文件并执行

import Database from "@tauri-apps/plugin-sql"
import { appDataDir, join } from "@tauri-apps/api/path"
import { readTextFile, exists } from "@tauri-apps/plugin-fs"

const MIGRATIONS_TABLE = "__drizzle_migrations"

let db: Awaited<ReturnType<typeof Database.load>> | null = null

async function getDb() {
  if (!db) {
    const baseDir = await appDataDir()
    const dbPath = await join(baseDir, "memories.db")
    db = await Database.load(`sqlite:${dbPath}`)
  }
  return db
}

// 初始化迁移记录表
async function initMigrationsTable(sqlite: Awaited<ReturnType<typeof getDb>>) {
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)
}

// 获取已应用的迁移
async function getAppliedMigrations(sqlite: Awaited<ReturnType<typeof getDb>>) {
  try {
    const result = await sqlite.select<{ name: string }[]>(
      `SELECT name FROM ${MIGRATIONS_TABLE}`
    )
    return result.map((r) => r.name)
  } catch {
    return []
  }
}

// 执行单条 SQL
async function executeSql(sqlite: Awaited<ReturnType<typeof getDb>>, sql: string) {
  // drizzle-kit 使用 --> statement-breakpoint 分隔符
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

// 迁移文件名列表（按顺序）
const MIGRATION_FILES = [
  "0000_lying_reavers.sql",
  "0001_fantastic_redwing.sql",
]

// 获取项目根目录下的 drizzle 迁移文件夹路径
async function getMigrationsDir(): Promise<string> {
  const baseDir = await appDataDir()
  // 应用数据目录结构:
  //   Win: %APPDATA%/com.neezy.studio/
  //   Mac: ~/Library/Application Support/com.neezy.studio/
  // 尝试多层回退查找项目根目录下的 drizzle/ 文件夹
  const possiblePaths = [
    await join(baseDir, "..", "..", "..", "drizzle"),
    await join(baseDir, "..", "..", "..", "..", "drizzle"),
    await join(baseDir, "..", "..", "..", "..", "..", "drizzle"),
  ]

  for (const p of possiblePaths) {
    try {
      if (await exists(p)) {
        return p
      }
    } catch {
      // continue
    }
  }

  // fallback: 使用第一层父目录
  return await join(baseDir, "..", "drizzle")
}

// 运行所有待应用的迁移
export async function runMigrations() {
  const sqlite = await getDb()
  await initMigrationsTable(sqlite)
  const applied = await getAppliedMigrations(sqlite)

  const migrationsDir = await getMigrationsDir()
  console.log("[migrate] Using migrations directory:", migrationsDir)

  for (const fileName of MIGRATION_FILES) {
    if (applied.includes(fileName)) continue

    try {
      const filePath = await join(migrationsDir, fileName)
      const fileExists = await exists(filePath)
      if (!fileExists) {
        console.log(`[migrate] Skipping ${fileName} - file not found at ${filePath}`)
        continue
      }
      const sql = await readTextFile(filePath)

      console.log(`[migrate] Applying: ${fileName}`)
      await executeSql(sqlite, sql)

      await sqlite.execute(
        `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES ($1, $2)`,
        [fileName, Date.now()]
      )
      console.log(`[migrate] Applied: ${fileName}`)
    } catch (e) {
      console.error(`[migrate] Failed to apply ${fileName}:`, e)
    }
  }
}