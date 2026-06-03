import type { App } from "electron"
import fs from "node:fs"
import path from "node:path"
import { parse as parseJsonc } from "jsonc-parser"

import {
  DEFAULT_PERMISSION_EXTENSION,
  DEFAULT_PERMISSION_POLICY,
  normalizeAgentPermissionPolicy,
  normalizePermissionExtensionConfig,
  normalizeSandboxPolicy,
  type AgentPermissionPolicy,
  type AgentPermissionSettings,
  type PermissionExtensionConfig,
  type SandboxPolicyConfig,
} from "../shared/agent-permissions"
import {
  applyPermissionGrantToPolicy,
  type PermissionGrantTarget,
} from "../shared/permission-prompt-grant"
import { getPiAgentDir } from "./pi-agent-env"
import { resolveStoragePaths } from "./storage-paths"

const PERMISSION_EXTENSION_CONFIG_NAME = "pi-permission-extension.json"

export function getPermissionExtensionConfigPath(agentDir: string): string {
  return path.join(agentDir, PERMISSION_EXTENSION_CONFIG_NAME)
}

export function ensurePermissionExtensionEnv(agentDir: string): void {
  process.env.PI_PERMISSION_SYSTEM_CONFIG_PATH = getPermissionExtensionConfigPath(agentDir)
}

function readJsoncFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf-8")
  return parseJsonc(raw)
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function ensureGlobalPolicyFile(agentDir: string): string {
  const policyPath = path.join(agentDir, "pi-permissions.jsonc")
  if (!fs.existsSync(policyPath)) {
    writeJsonFile(policyPath, DEFAULT_PERMISSION_POLICY)
  }
  return policyPath
}

function ensureExtensionConfigFile(agentDir: string): string {
  const configPath = getPermissionExtensionConfigPath(agentDir)
  if (!fs.existsSync(configPath)) {
    writeJsonFile(configPath, DEFAULT_PERMISSION_EXTENSION)
  }
  return configPath
}

function ensureSandboxFile(agentDir: string, enabled: boolean): string {
  const sandboxPath = path.join(agentDir, "sandbox.json")
  if (!fs.existsSync(sandboxPath)) {
    writeJsonFile(sandboxPath, {
      enabled,
      network: { allowedDomains: ["github.com", "*.github.com"], deniedDomains: [] },
      filesystem: {
        denyRead: [],
        allowRead: [".", "~"],
        allowWrite: [".", "~"],
        denyWrite: [".env", ".env.*", "*.pem", "*.key"],
      },
    })
  }
  return sandboxPath
}

function loadPolicyFile(policyPath: string): AgentPermissionPolicy {
  if (!fs.existsSync(policyPath)) {
    return structuredClone(DEFAULT_PERMISSION_POLICY)
  }
  try {
    return normalizeAgentPermissionPolicy(readJsoncFile(policyPath))
  } catch {
    return structuredClone(DEFAULT_PERMISSION_POLICY)
  }
}

function loadExtensionConfig(configPath: string): PermissionExtensionConfig {
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_PERMISSION_EXTENSION }
  }
  try {
    return normalizePermissionExtensionConfig(readJsoncFile(configPath))
  } catch {
    return { ...DEFAULT_PERMISSION_EXTENSION }
  }
}

function loadSandboxConfig(sandboxPath: string): SandboxPolicyConfig {
  if (!fs.existsSync(sandboxPath)) {
    return { enabled: process.platform === "darwin" || process.platform === "linux" }
  }
  try {
    return normalizeSandboxPolicy(readJsoncFile(sandboxPath))
  } catch {
    return { enabled: false }
  }
}

export function loadAgentPermissionSettings(app: App): AgentPermissionSettings {
  const agentDir = getPiAgentDir(app)
  const dataRoot = resolveStoragePaths(app).dataRoot
  const sandboxSupported = process.platform === "darwin" || process.platform === "linux"

  ensurePermissionExtensionEnv(agentDir)
  const globalPolicyPath = ensureGlobalPolicyFile(agentDir)
  const extensionConfigPath = ensureExtensionConfigFile(agentDir)
  const sandboxConfigPath = ensureSandboxFile(agentDir, sandboxSupported)
  const projectPolicyPath = path.join(dataRoot, ".pi", "agent", "pi-permissions.jsonc")

  return {
    globalPolicyPath,
    projectPolicyPath,
    extensionConfigPath,
    sandboxConfigPath,
    sandboxSupported,
    policy: loadPolicyFile(globalPolicyPath),
    extension: loadExtensionConfig(extensionConfigPath),
    sandbox: loadSandboxConfig(sandboxConfigPath),
  }
}

export interface SaveAgentPermissionInput {
  policy: AgentPermissionPolicy
  extension: PermissionExtensionConfig
  sandbox: SandboxPolicyConfig
}

export function saveAgentPermissionSettings(
  app: App,
  input: SaveAgentPermissionInput
): AgentPermissionSettings {
  const current = loadAgentPermissionSettings(app)
  const policy = normalizeAgentPermissionPolicy(input.policy)
  const extension = normalizePermissionExtensionConfig(input.extension)
  const sandbox = normalizeSandboxPolicy(input.sandbox)

  writeJsonFile(current.globalPolicyPath, policy)
  writeJsonFile(current.extensionConfigPath, extension)

  if (current.sandboxSupported) {
    let sandboxRaw: Record<string, unknown> = {}
    if (fs.existsSync(current.sandboxConfigPath)) {
      try {
        const parsed = readJsoncFile(current.sandboxConfigPath)
        if (parsed && typeof parsed === "object") {
          sandboxRaw = parsed as Record<string, unknown>
        }
      } catch {
        sandboxRaw = {}
      }
    }
    writeJsonFile(current.sandboxConfigPath, { ...sandboxRaw, enabled: sandbox.enabled })
  }

  return loadAgentPermissionSettings(app)
}

export function applyPermissionGrantToGlobalPolicy(
  app: App,
  target: PermissionGrantTarget
): AgentPermissionSettings {
  const current = loadAgentPermissionSettings(app)
  const policy = applyPermissionGrantToPolicy(current.policy, target)
  writeJsonFile(current.globalPolicyPath, policy)
  return loadAgentPermissionSettings(app)
}

export function resetAgentPermissionSettings(app: App): AgentPermissionSettings {
  const current = loadAgentPermissionSettings(app)
  writeJsonFile(current.globalPolicyPath, DEFAULT_PERMISSION_POLICY)
  writeJsonFile(current.extensionConfigPath, DEFAULT_PERMISSION_EXTENSION)
  if (current.sandboxSupported && fs.existsSync(current.sandboxConfigPath)) {
    let sandboxRaw: Record<string, unknown> = {}
    try {
      const parsed = readJsoncFile(current.sandboxConfigPath)
      if (parsed && typeof parsed === "object") {
        sandboxRaw = parsed as Record<string, unknown>
      }
    } catch {
      sandboxRaw = {}
    }
    writeJsonFile(current.sandboxConfigPath, {
      ...sandboxRaw,
      enabled: process.platform === "darwin" || process.platform === "linux",
    })
  }
  return loadAgentPermissionSettings(app)
}
