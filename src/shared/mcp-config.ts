export type McpServerTransport = "stdio" | "http"

/** 应用内编辑用的 MCP 服务器条目（落盘为 pi-mcp-adapter 的 ServerEntry） */
export interface McpServerDraft {
  name: string
  transport: McpServerTransport
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  disabled?: boolean
}

export interface McpConfigSnapshot {
  configPath: string
  servers: McpServerDraft[]
}

export function normalizeMcpServerName(name: string): string {
  return name.trim().replace(/\s+/g, "-")
}

export function isValidMcpServerName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)
}
