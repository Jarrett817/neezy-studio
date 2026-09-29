/** 应用配置（仅 userData/app-config.json；聊天与画像在 dataRoot/memories.db） */

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
  activeChatModelId: "",
  chatModels: [],
}
