/** 应用配置（仅 userData/app-config.json；聊天与画像在 dataRoot/memories.db） */

export const AGENT_THINKING_LEVEL_AUTO = "auto" as const

export const PI_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

export type PiThinkingLevel = (typeof PI_THINKING_LEVELS)[number]

export type AgentThinkingLevelSetting =
  | typeof AGENT_THINKING_LEVEL_AUTO
  | PiThinkingLevel

export const AGENT_THINKING_LEVEL_OPTIONS: {
  value: AgentThinkingLevelSetting
  label: string
}[] = [
  { value: AGENT_THINKING_LEVEL_AUTO, label: "自动（按模型）" },
  { value: "off", label: "关闭" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
  { value: "max", label: "最大" },
]

export function normalizeAgentThinkingLevel(
  value: unknown
): AgentThinkingLevelSetting {
  if (value === AGENT_THINKING_LEVEL_AUTO) return AGENT_THINKING_LEVEL_AUTO
  if (
    typeof value === "string" &&
    (PI_THINKING_LEVELS as readonly string[]).includes(value)
  ) {
    return value as PiThinkingLevel
  }
  return AGENT_THINKING_LEVEL_AUTO
}

export interface AppConfigChatModel {
  id: string
  label: string
  tier: "light" | "balanced" | "performance"
  model: string
  enabled: boolean
  preset?: string
  baseUrl?: string
  apiKey?: string
  /** 用户自定义上下文上限（token）；空则用目录/默认 */
  contextWindow?: number
}

export interface AppConfig {
  version: 1
  /** 数据根目录（memories.db、memories/、models/ 等）；默认 userData，可改为其它盘 */
  dataRoot: string
  /** Agent 工具 cwd；空则回退 dataRoot */
  workspaceDir: string
  preferLowPower: boolean
  maxCpuPercent: number
  /** Pi Agent 思考程度；auto 时按当前模型推断 */
  agentThinkingLevel: AgentThinkingLevelSetting
  /** 当前用于对话的 chatModels[].id */
  activeChatModelId: string
  chatModels: AppConfigChatModel[]
}

export const APP_CONFIG_VERSION = 1 as const

export const DEFAULT_APP_CONFIG: AppConfig = {
  version: 1,
  dataRoot: "",
  workspaceDir: "",
  preferLowPower: true,
  maxCpuPercent: 95,
  agentThinkingLevel: AGENT_THINKING_LEVEL_AUTO,
  activeChatModelId: "",
  chatModels: [],
}
