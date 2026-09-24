import fs from "node:fs/promises"
import path from "node:path"
import { app } from "electron"

import { resolveStoragePaths } from "./storage-paths"

/**
 * soul.md 是 agent 的跨会话长期沉淀文件，位于工作区根（dataRoot/soul.md）。
 * pi-coding-agent 本身无长期记忆，此文件在每次会话构建 system prompt 时读入，
 * 并由 soul_write 工具让 agent 主动追加沉淀。
 */

const SOUL_FILE = "soul.md"
const MAX_SOUL_CHARS = 12_000

function getSoulPath(): string {
  return path.join(resolveStoragePaths(app).dataRoot, SOUL_FILE)
}

export async function readSoul(): Promise<string> {
  try {
    return (await fs.readFile(getSoulPath(), "utf-8")).trim()
  } catch {
    return ""
  }
}

export async function appendSoul(entry: string): Promise<void> {
  const text = entry.trim()
  if (!text) return
  const soulPath = getSoulPath()
  await fs.mkdir(path.dirname(soulPath), { recursive: true })
  const current = await readSoul()
  const stamped = `- [${new Date().toISOString().slice(0, 10)}] ${text}`
  const next = current ? `${current}\n${stamped}` : `# Soul\n\n${stamped}`
  await fs.writeFile(soulPath, `${next.slice(-MAX_SOUL_CHARS)}\n`, "utf-8")
}
