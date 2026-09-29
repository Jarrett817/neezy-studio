import type { McpConfigSnapshot, McpServerDraft } from "../../../shared/mcp-config"
import { getElectronApi } from "./electron-client"

export type { McpConfigSnapshot, McpServerDraft }

export function getMcpConfig(): Promise<McpConfigSnapshot> {
  return getElectronApi().getMcpConfig()
}

export function saveMcpConfig(servers: McpServerDraft[]): Promise<McpConfigSnapshot> {
  return getElectronApi().saveMcpConfig(servers)
}
