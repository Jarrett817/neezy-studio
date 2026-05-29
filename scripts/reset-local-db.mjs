#!/usr/bin/env node
/**
 * 删除本地 memories.db（及 WAL），下次启动由 ensureInit 自动 migrate 建库。
 * 用法：先完全退出 Neezy Studio / Electron，再 bun run db:reset
 */
import fs from "node:fs"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { resolveDataRoots } from "./resolve-app-data-roots.mjs"

const LOCKED_CODES = new Set(["EBUSY", "EPERM", "EACCES"])
const RETRY_ATTEMPTS = 8
const RETRY_DELAY_MS = 500

async function tryRemove(file) {
  if (!fs.existsSync(file)) return { ok: true, skipped: true }

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      fs.rmSync(file, { force: true })
      console.log(`removed ${file}`)
      return { ok: true, skipped: false }
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? err.code : ""
      if (!LOCKED_CODES.has(code)) throw err
      if (attempt < RETRY_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      return { ok: false, code, path: file }
    }
  }
  return { ok: false, code: "EBUSY", path: file }
}

async function removeDbFiles(dir) {
  const base = path.join(dir, "memories.db")
  const failed = []
  for (const file of [base, `${base}-wal`, `${base}-shm`]) {
    const result = await tryRemove(file)
    if (!result.ok) failed.push(result)
  }
  return failed
}

function printLockedHelp(failed) {
  const paths = [...new Set(failed.map((f) => f.path))]
  console.error("\n无法删除数据库文件（被占用 EBUSY）：")
  for (const p of paths) console.error(`  ${p}`)
  console.error(`
请先完全退出 Neezy Studio（Electron），确认托盘/后台无进程后再执行：
  bun run db:reset

若已退出仍失败，可在任务管理器中结束 electron.exe / neezy-studio 相关进程后重试。`)
}

const projectDrizzleDb = path.join(process.cwd(), "drizzle", "neezy-memory.db")
const allFailed = []

for (const file of [
  projectDrizzleDb,
  `${projectDrizzleDb}-wal`,
  `${projectDrizzleDb}-shm`,
]) {
  const result = await tryRemove(file)
  if (!result.ok) allFailed.push(result)
}

for (const root of resolveDataRoots()) {
  const failed = await removeDbFiles(root)
  allFailed.push(...failed)
}

if (allFailed.length > 0) {
  printLockedHelp(allFailed)
  process.exit(1)
}

console.log("done — restart the app to create a fresh database")
