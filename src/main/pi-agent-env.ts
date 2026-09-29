import type { App } from "electron"
import fs from "node:fs"
import path from "node:path"

import { DEFAULT_PERMISSION_POLICY } from "../shared/agent-permissions"
import { ensurePermissionExtensionEnv } from "./agent-permissions-store"

export function getPiAgentDir(app: App): string {
  return path.join(app.getPath("userData"), "pi-agent")
}

function ensureDefaultGlobalPermissions(agentDir: string): void {
  const policyPath = path.join(agentDir, "pi-permissions.jsonc")
  if (fs.existsSync(policyPath)) return
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(
    policyPath,
    `${JSON.stringify(DEFAULT_PERMISSION_POLICY, null, 2)}\n`,
    "utf-8"
  )
}

/** 与 createAgentSession 的 agentDir 一致，供 pi-permission-system 的 getAgentDir() 读取策略。 */
export function ensurePiAgentEnvironment(app: App): string {
  const agentDir = getPiAgentDir(app)
  process.env.PI_CODING_AGENT_DIR = agentDir
  ensurePermissionExtensionEnv(agentDir)
  ensureDefaultGlobalPermissions(agentDir)
  return agentDir
}
