#!/usr/bin/env node
/**
 * 解析 Electron 应用实际使用的 memories.db 路径（与 app-config.json dataRoot 一致）。
 * 输出可用于 drizzle-kit 的 file: URL。
 */
import fs from "node:fs"
import path from "node:path"
import { resolveDataRoots } from "./resolve-app-data-roots.mjs"

export function pickDatabaseFile() {
  for (const root of resolveDataRoots()) {
    const candidate = path.join(root, "memories.db")
    if (fs.existsSync(candidate)) return candidate
  }
  const roots = resolveDataRoots()
  return path.join(roots[0], "memories.db")
}

const dbFile = pickDatabaseFile()
const url = `file:${dbFile.replace(/\\/g, "/")}`
if (process.argv.includes("--print-path")) {
  console.log(dbFile)
} else {
  console.log(url)
}
