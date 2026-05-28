#!/usr/bin/env node
/**
 * 删除本地 memories.db（及 WAL），下次启动由 ensureInit 自动 migrate 建库。
 * 用法：先退出 Electron，再 bun run db:reset
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const appName = "neezy-studio"

/** 常见自定义盘符路径（与设置里填写的 dataRoot 一致即可删库） */
const KNOWN_DATA_ROOTS = [
  "D:\\nezzy-studio-cache",
  "D:\\neezy-studio-cache",
]

function resolveDataRoots() {
  const roots = new Set(KNOWN_DATA_ROOTS.map((p) => path.resolve(p)))
  const roaming =
    process.env.APPDATA ??
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), "AppData", "Roaming"))
  const userData = path.join(roaming, appName)
  roots.add(userData)

  const configFile = path.join(userData, "storage-paths.json")
  if (fs.existsSync(configFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configFile, "utf8"))
      if (raw?.dataRoot) roots.add(path.resolve(raw.dataRoot))
    } catch {
      /* ignore */
    }
  }
  return [...roots]
}

function removeDbFiles(dir) {
  const base = path.join(dir, "memories.db")
  for (const file of [base, `${base}-wal`, `${base}-shm`]) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true })
      console.log(`removed ${file}`)
    }
  }
}

const projectDrizzleDb = path.join(process.cwd(), "drizzle", "neezy-memory.db")
for (const file of [
  projectDrizzleDb,
  `${projectDrizzleDb}-wal`,
  `${projectDrizzleDb}-shm`,
]) {
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true })
    console.log(`removed ${file}`)
  }
}

for (const root of resolveDataRoots()) {
  removeDbFiles(root)
}

console.log("done — restart the app to create a fresh database")
