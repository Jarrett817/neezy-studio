#!/usr/bin/env node
/**
 * 启动 drizzle-kit studio（@libsql/client，无需 node-gyp 编译）。
 * 连接路径与 Electron 一致：resolve-app-database.mjs → app-config dataRoot/memories.db
 */
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { execSync } from "node:child_process"

const require = createRequire(import.meta.url)

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim()
  return execSync("node scripts/resolve-app-database.mjs", {
    encoding: "utf8",
    cwd: process.cwd(),
  }).trim()
}

try {
  require.resolve("@libsql/client")
} catch {
  console.error(
    [
      "缺少 @libsql/client（drizzle-kit studio 用）。",
      "  bun add -d @libsql/client",
      "",
      "查看数据：bun run db:inspect",
    ].join("\n")
  )
  process.exit(1)
}

const databaseUrl = resolveDatabaseUrl()
console.log("[db:studio] driver: @libsql/client")
console.log(`[db:studio] database: ${databaseUrl}`)

const child = spawn("bunx", ["drizzle-kit", "studio"], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl },
})

child.on("exit", (code) => process.exit(code ?? 1))
