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

/** pi-permission-system 默认读 mcp.json，pi-mcp-adapter 读 mcp-adapter.json */
function getMcpJsonPath(agentDir: string): string {
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
  const data = { ...existing, mcpServers }
  writeJsonFile(adapterPath, data)
  // pi-permission-system 默认读 mcp.json，同步写入
  writeJsonFile(getMcpJsonPath(agentDir), { mcpServers })

  return loadMcpConfig(app)
}

export function ensureMcpConfigFiles(app: App): void {
  const agentDir = getPiAgentDir(app)
  const adapterPath = getAdapterConfigPath(agentDir)
  const mcpJsonPath = getMcpJsonPath(agentDir)
  if (!fs.existsSync(adapterPath)) {
    writeJsonFile(adapterPath, { mcpServers: {} })
  }
  if (!fs.existsSync(mcpJsonPath)) {
    writeJsonFile(mcpJsonPath, { mcpServers: {} })
  }
}

const DEFAULT_MCP_JSON = `{
  "mcpServers": {}
}
`

export function readMcpJson(app: App): { path: string; content: string } {
  const agentDir = getPiAgentDir(app)
  const adapterPath = getAdapterConfigPath(agentDir)
  ensureMcpConfigFiles(app)
  try {
    const content = fs.readFileSync(adapterPath, "utf-8")
    return { path: adapterPath, content }
  } catch {
    return { path: adapterPath, content: DEFAULT_MCP_JSON }
  }
}

export async function writeMcpJson(app: App, content: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error(`JSON 格式错误：${e instanceof Error ? e.message : e}`)
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("顶层必须是对象")
  }
  const agentDir = getPiAgentDir(app)
  const adapterPath = getAdapterConfigPath(agentDir)
  writeJsonFile(adapterPath, parsed)
  // 同步 mcp.json 供 pi-permission-system 读取
  writeJsonFile(getMcpJsonPath(agentDir), parsed)
}
