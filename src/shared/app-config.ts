/** 应用配置（仅 userData/app-config.json；聊天与画像在 dataRoot/memories.db） */

export interface AppConfigChatModel {
  id: string
  label: string
  tier: "light" | "balanced" | "performance"
  transport: "ollama" | "openai-compatible"
  model: string
  enabled: boolean
  preset?: string
  baseUrl?: string
  apiKey?: string
}

export interface AppConfig {
  version: 1
  /** 数据根目录（memories.db、memories/、models/ 等）；默认 userData，可改为其它盘 */
  dataRoot: string
  preferLowPower: boolean
  maxCpuPercent: number
  ollamaHost: string
  /** 当前用于对话的 chatModels[].id */
  activeChatModelId: string
  chatModels: AppConfigChatModel[]
}

export const APP_CONFIG_VERSION = 1 as const

export const DEFAULT_APP_CONFIG: AppConfig = {
  version: 1,
  dataRoot: "",
  preferLowPower: true,
  maxCpuPercent: 95,
  ollamaHost: "http://127.0.0.1:11434",
  activeChatModelId: "",
  chatModels: [],
}
