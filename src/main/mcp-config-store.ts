import fs from "node:fs"
import path from "node:path"
import type { App } from "electron"

import {
  isValidMcpServerName,
  type McpConfigSnapshot,
  type McpServerDraft,
  normalizeMcpServerName,
} from "../shared/mcp-config"
import { getPiAgentDir } from "./pi-agent-env"

interface StoredServerEntry {
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  disabled?: boolean
  httpTransport?: "streamable-http" | "sse"
}

interface StoredMcpFile {
  mcpServers?: Record<string, StoredServerEntry>
}

function getAdapterConfigPath(agentDir: string): string {
  return path.join(agentDir, "mcp-adapter.json")
}

function getPermissionMcpPath(agentDir: string): string {
  return path.join(agentDir, "mcp.json")
}

function readJsonFile(filePath: string): StoredMcpFile {
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown
    if (!raw || typeof raw !== "object") return {}
    return raw as StoredMcpFile
  } catch {
    return {}
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function entryToDraft(name: string, entry: StoredServerEntry): McpServerDraft {
  const hasUrl = Boolean(entry.url?.trim())
  return {
    name,
    transport: hasUrl ? "http" : "stdio",
    command: entry.command?.trim() || undefined,
    args: Array.isArray(entry.args) ? entry.args.map(String) : undefined,
    url: entry.url?.trim() || undefined,
    env:
      entry.env && typeof entry.env === "object"
        ? Object.fromEntries(
            Object.entries(entry.env).filter(
              ([k, v]) => typeof k === "string" && typeof v === "string"
            )
          )
        : undefined,
    disabled: entry.disabled === true,
  }
}

function draftToEntry(draft: McpServerDraft): StoredServerEntry {
  if (draft.transport === "http") {
    return {
      url: draft.url?.trim() || "",
      httpTransport: "streamable-http",
      ...(draft.env && Object.keys(draft.env).length > 0
        ? { env: draft.env }
        : {}),
      ...(draft.disabled ? { disabled: true } : {}),
    }
  }
  return {
    command: draft.command?.trim() || "",
    args: draft.args?.length ? draft.args : [],
    ...(draft.env && Object.keys(draft.env).length > 0
      ? { env: draft.env }
      : {}),
    ...(draft.disabled ? { disabled: true } : {}),
  }
}

function validateDraft(draft: McpServerDraft): void {
  const name = normalizeMcpServerName(draft.name)
  if (!isValidMcpServerName(name)) {
    throw new Error(`无效的服务器名：${draft.name}`)
  }
  if (draft.transport === "http") {
    if (!draft.url?.trim()) throw new Error(`「${name}」缺少 URL`)
  } else if (!draft.command?.trim()) {
    throw new Error(`「${name}」缺少 command`)
  }
}

export function loadMcpConfig(app: App): McpConfigSnapshot {
  const agentDir = getPiAgentDir(app)
  const configPath = getAdapterConfigPath(agentDir)
  const stored = readJsonFile(configPath)
  const servers = Object.entries(stored.mcpServers ?? {}).map(([name, entry]) =>
    entryToDraft(name, entry ?? {})
  )
  return { configPath, servers }
}

export function saveMcpConfig(
  app: App,
  servers: McpServerDraft[]
): McpConfigSnapshot {
  const agentDir = getPiAgentDir(app)
  const adapterPath = getAdapterConfigPath(agentDir)
  const permissionPath = getPermissionMcpPath(agentDir)

  const mcpServers: Record<string, StoredServerEntry> = {}
  const seen = new Set<string>()
  for (const raw of servers) {
    validateDraft(raw)
    const name = normalizeMcpServerName(raw.name)
    if (seen.has(name)) throw new Error(`服务器名重复：${name}`)
    seen.add(name)
    mcpServers[name] = draftToEntry({ ...raw, name })
  }

  const existing = readJsonFile(adapterPath)
  writeJsonFile(adapterPath, { ...existing, mcpServers })
  // pi-permission-system 读 mcp.json 的服务器名做策略匹配；adapter 本身不读此文件
  writeJsonFile(permissionPath, { mcpServers })

  return loadMcpConfig(app)
}

export function ensureMcpConfigFiles(app: App): void {
  const agentDir = getPiAgentDir(app)
  const adapterPath = getAdapterConfigPath(agentDir)
  if (!fs.existsSync(adapterPath)) {
    writeJsonFile(adapterPath, { mcpServers: {} })
  }
}
