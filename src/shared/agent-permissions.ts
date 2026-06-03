export type PermissionState = "allow" | "deny" | "ask"

export interface PermissionDefaultPolicy {
  tools: PermissionState
  bash: PermissionState
  mcp: PermissionState
  skills: PermissionState
  special: PermissionState
}

export interface AgentPermissionPolicy {
  defaultPolicy: PermissionDefaultPolicy
  tools: Record<string, PermissionState>
  bash: Record<string, PermissionState>
  mcp: Record<string, PermissionState>
  skills: Record<string, PermissionState>
  special: Record<string, PermissionState>
}

export interface PermissionExtensionConfig {
  yoloMode: boolean
}

export interface SandboxPolicyConfig {
  enabled: boolean
}

export interface AgentPermissionSettings {
  globalPolicyPath: string
  projectPolicyPath: string
  extensionConfigPath: string
  sandboxConfigPath: string
  sandboxSupported: boolean
  policy: AgentPermissionPolicy
  extension: PermissionExtensionConfig
  sandbox: SandboxPolicyConfig
}

export const PI_BUILTIN_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "grep",
  "find",
  "ls",
] as const

export const DEFAULT_PERMISSION_POLICY: AgentPermissionPolicy = {
  defaultPolicy: {
    tools: "ask",
    bash: "ask",
    mcp: "ask",
    skills: "ask",
    special: "ask",
  },
  tools: {
    read: "ask",
    write: "ask",
    edit: "ask",
    grep: "allow",
    find: "allow",
    ls: "ask",
    browser_navigate: "ask",
    browser_click: "ask",
    browser_type: "ask",
    browser_scroll: "ask",
    browser_screenshot: "ask",
    browser_read: "ask",
    browser_evaluate: "ask",
    chrome_navigate: "ask",
    chrome_snapshot: "ask",
    chrome_click: "ask",
    chrome_tab: "ask",
    chrome_screenshot: "ask",
    chrome_evaluate: "ask",
  },
  bash: {
    "*": "ask",
  },
  mcp: {},
  skills: {},
  special: {
    external_directory: "ask",
    doom_loop: "deny",
  },
}

export const DEFAULT_PERMISSION_EXTENSION: PermissionExtensionConfig = {
  yoloMode: false,
}

export type PermissionPresetId = "strict" | "balanced" | "permissive"

export const PERMISSION_PRESETS: Record<PermissionPresetId, AgentPermissionPolicy> = {
  strict: {
    defaultPolicy: {
      tools: "ask",
      bash: "ask",
      mcp: "ask",
      skills: "ask",
      special: "ask",
    },
    tools: Object.fromEntries(PI_BUILTIN_TOOL_NAMES.map((name) => [name, "ask"])),
    bash: { "*": "ask" },
    mcp: {},
    skills: {},
    special: {
      external_directory: "ask",
      doom_loop: "deny",
    },
  },
  balanced: DEFAULT_PERMISSION_POLICY,
  permissive: {
    defaultPolicy: {
      tools: "ask",
      bash: "ask",
      mcp: "ask",
      skills: "ask",
      special: "ask",
    },
    tools: {
      read: "allow",
      write: "ask",
      edit: "ask",
      grep: "allow",
      find: "allow",
      ls: "allow",
    },
    bash: { "*": "ask" },
    mcp: {},
    skills: {},
    special: {
      external_directory: "ask",
      doom_loop: "deny",
    },
  },
}

const PERMISSION_STATES: PermissionState[] = ["allow", "deny", "ask"]

function isPermissionState(value: unknown): value is PermissionState {
  return typeof value === "string" && PERMISSION_STATES.includes(value as PermissionState)
}

function normalizeRecord(
  value: unknown,
  fallback: Record<string, PermissionState>
): Record<string, PermissionState> {
  if (!value || typeof value !== "object") return { ...fallback }
  const out: Record<string, PermissionState> = { ...fallback }
  for (const [key, state] of Object.entries(value as Record<string, unknown>)) {
    if (isPermissionState(state)) out[key] = state
  }
  return out
}

export function normalizeAgentPermissionPolicy(raw: unknown): AgentPermissionPolicy {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const partialDefault =
    record.defaultPolicy && typeof record.defaultPolicy === "object"
      ? (record.defaultPolicy as Record<string, unknown>)
      : {}

  return {
    defaultPolicy: {
      tools: isPermissionState(partialDefault.tools)
        ? partialDefault.tools
        : DEFAULT_PERMISSION_POLICY.defaultPolicy.tools,
      bash: isPermissionState(partialDefault.bash)
        ? partialDefault.bash
        : DEFAULT_PERMISSION_POLICY.defaultPolicy.bash,
      mcp: isPermissionState(partialDefault.mcp)
        ? partialDefault.mcp
        : DEFAULT_PERMISSION_POLICY.defaultPolicy.mcp,
      skills: isPermissionState(partialDefault.skills)
        ? partialDefault.skills
        : DEFAULT_PERMISSION_POLICY.defaultPolicy.skills,
      special: isPermissionState(partialDefault.special)
        ? partialDefault.special
        : DEFAULT_PERMISSION_POLICY.defaultPolicy.special,
    },
    tools: normalizeRecord(record.tools, DEFAULT_PERMISSION_POLICY.tools),
    bash: normalizeRecord(record.bash, DEFAULT_PERMISSION_POLICY.bash),
    mcp: normalizeRecord(record.mcp, DEFAULT_PERMISSION_POLICY.mcp),
    skills: normalizeRecord(record.skills, DEFAULT_PERMISSION_POLICY.skills),
    special: normalizeRecord(record.special, DEFAULT_PERMISSION_POLICY.special),
  }
}

export function normalizePermissionExtensionConfig(raw: unknown): PermissionExtensionConfig {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    yoloMode: record.yoloMode === true,
  }
}

export function normalizeSandboxPolicy(raw: unknown): SandboxPolicyConfig {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    enabled: record.enabled !== false,
  }
}
