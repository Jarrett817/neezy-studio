import type { App } from "electron"

import type { AppConfig } from "../shared/app-config"
import type { ChatModelEntry } from "./chat-model-entry"
import { type RuntimeSettings, syncRuntimeSettings } from "./runtime-settings"
import { invalidateStoragePathsCache } from "./storage-paths"

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
    contextWindow: e.contextWindow,
  }))

  return {
    preferLowPower: config.preferLowPower,
    maxCpuPercent: config.maxCpuPercent,
    agentThinkingLevel: config.agentThinkingLevel,
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

export function applyAppConfig(_app: App, config: AppConfig): AppConfig {
  const runtime = appConfigToRuntime(config)
  syncRuntimeSettings(runtime)
  invalidateStoragePathsCache()
  return config
}
