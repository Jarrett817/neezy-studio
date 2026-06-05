import type { App } from "electron"

import type { AppConfig } from "../shared/app-config"
import type { ChatModelEntry } from "./chat-model-entry"
import { invalidateStoragePathsCache } from "./storage-paths"
import { syncRuntimeSettings, type RuntimeSettings } from "./runtime-settings"

export function appConfigToRuntime(config: AppConfig): RuntimeSettings {
  const chatModels: ChatModelEntry[] = config.chatModels.map((e) => ({
    id: e.id,
    label: e.label,
    tier: e.tier,
    model: e.model,
    enabled: e.enabled,
    preset: e.preset,
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
  }))

  return {
    preferLowPower: config.preferLowPower,
    maxCpuPercent: config.maxCpuPercent,
    activeChatModelId: config.activeChatModelId?.trim() ?? "",
    llmProvider: {
      preset: "custom",
      baseUrl: "",
      apiKey: "",
      model: "",
    },
    chatModels,
  }
}

export function applyAppConfig(app: App, config: AppConfig): AppConfig {
  const runtime = appConfigToRuntime(config)
  syncRuntimeSettings(runtime)
  invalidateStoragePathsCache()
  return config
}
