#!/usr/bin/env node
/**
 * 查看 Electron 实际使用的 memories.db（@libsql/client，含 F32_BLOB 向量表）。
 * 用法：bun run db:inspect
 */
import { DatabaseSync } from "node:sqlite"
import path from "node:path"
import { pickDatabaseFile } from "./resolve-app-database.mjs"

const dbFile = pickDatabaseFile()
const db = new DatabaseSync(dbFile, { readOnly: true })

console.log(`database: ${dbFile}\n`)

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  .all()
  .map((r) => r.name)

for (const table of tables) {
  try {
    const count = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n
    console.log(`${table}: ${count} rows`)
    if (count > 0 && count <= 8) {
      const rows = db.prepare(`SELECT * FROM "${table}" LIMIT 8`).all()
      for (const row of rows) {
        const slim = {}
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
            slim[key] = `<binary ${value.byteLength ?? value.length} bytes>`
          } else if (typeof value === "string" && value.length > 120) {
            slim[key] = `${value.slice(0, 120)}…`
          } else {
            slim[key] = value
          }
        }
        console.log(`  ${JSON.stringify(slim)}`)
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`${table}: (skip — ${msg})`)
  }
}

db.close()
