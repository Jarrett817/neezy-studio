import type { App } from "electron"
import fs from "node:fs"
import path from "node:path"
import { parse as parseJsonc } from "jsonc-parser"

import {
  DEFAULT_PERMISSION_EXTENSION,
  DEFAULT_PERMISSION_POLICY,
  normalizeAgentPermissionPolicy,
  normalizePermissionExtensionConfig,
  type AgentPermissionPolicy,
  type AgentPermissionSettings,
  type PermissionExtensionConfig,
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

export function loadAgentPermissionSettings(app: App): AgentPermissionSettings {
  const agentDir = getPiAgentDir(app)
  const dataRoot = resolveStoragePaths(app).dataRoot

  ensurePermissionExtensionEnv(agentDir)
  const globalPolicyPath = ensureGlobalPolicyFile(agentDir)
  const extensionConfigPath = ensureExtensionConfigFile(agentDir)
  const projectPolicyPath = path.join(dataRoot, ".pi", "agent", "pi-permissions.jsonc")

  return {
    globalPolicyPath,
    projectPolicyPath,
    extensionConfigPath,
    policy: loadPolicyFile(globalPolicyPath),
    extension: loadExtensionConfig(extensionConfigPath),
  }
}

export interface SaveAgentPermissionInput {
  policy: AgentPermissionPolicy
  extension: PermissionExtensionConfig
}

export function saveAgentPermissionSettings(
  app: App,
  input: SaveAgentPermissionInput
): AgentPermissionSettings {
  const current = loadAgentPermissionSettings(app)
  const policy = normalizeAgentPermissionPolicy(input.policy)
  const extension = normalizePermissionExtensionConfig(input.extension)

  writeJsonFile(current.globalPolicyPath, policy)
  writeJsonFile(current.extensionConfigPath, extension)

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
  return loadAgentPermissionSettings(app)
}
