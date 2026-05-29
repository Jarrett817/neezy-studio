import { defineConfig } from "drizzle-kit"
import { execSync } from "node:child_process"
import path from "path"

/** 与 Electron 相同库文件（app-config dataRoot）；db:studio 经 scripts/db-studio.mjs 注入 DATABASE_URL */
function resolveStudioDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const out = execSync("node scripts/resolve-app-database.mjs", {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim()
    if (out.startsWith("file:")) return out
  } catch {
    /* fallback */
  }
  return `file:${path.join(process.cwd(), "drizzle", "neezy-memory.db").replace(/\\/g, "/")}`
}

const DB_PATH = resolveStudioDatabaseUrl()

export default defineConfig({
  schema: "./src/renderer/app/services/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_PATH,
  },
})
