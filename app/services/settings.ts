// 运行时设置 - SQLite storage

import { getSetting, setSetting } from "~/services/storage/settings-store"

export type ModelTier = "light" | "balanced" | "performance"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  /** 已启用并在启动时由主进程 node-llama-cpp 加载的对话模型文件名（同时仅一个） */
  llmModel: string
  /** 向量检索时按需加载的 Embedding 模型文件名（不常驻内存） */
  embeddingModel: string
  /** 用户偏好的档位（可选，空则跟随系统推荐） */
  chatTier: ModelTier | ""
  embeddingTier: ModelTier | ""
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  llmModel: "",
  embeddingModel: "",
  chatTier: "",
  embeddingTier: "",
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settings = await getSetting<RuntimeSettings>("runtime_settings")
  return settings ?? DEFAULT_SETTINGS
}

export async function saveRuntimeSettings(
  settings: RuntimeSettings
): Promise<RuntimeSettings> {
  await setSetting("runtime_settings", settings)
  return settings
}
