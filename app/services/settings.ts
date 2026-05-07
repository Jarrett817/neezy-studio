// 运行时设置 - SQLite storage

import { getSetting, setSetting } from "~/services/storage/settings-store"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  ollamaModel: string
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  ollamaModel: "qwen3:1.7b",
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settings = await getSetting<RuntimeSettings>("runtime_settings")
  return settings ?? DEFAULT_SETTINGS
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettings> {
  await setSetting("runtime_settings", settings)
  return settings
}