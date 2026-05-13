// 运行时设置 - SQLite storage

import { getSetting, setSetting } from "~/services/storage/settings-store"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  webllmModel: string
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  webllmModel: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settings = await getSetting<RuntimeSettings>("runtime_settings")
  return settings ?? DEFAULT_SETTINGS
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettings> {
  await setSetting("runtime_settings", settings)
  return settings
}