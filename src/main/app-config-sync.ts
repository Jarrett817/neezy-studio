import type { App } from "electron"
import path from "node:path"

import type { AppConfig } from "../shared/app-config"
import type { ChatModelEntry } from "./chat-model-entry"
import { configureOllamaHost } from "./ollama/env"
import { resetOllamaClient } from "./ollama/client"
import { invalidateStoragePathsCache } from "./storage-paths"
import { syncRuntimeSettings, type RuntimeSettings } from "./runtime-settings"

export function appConfigToRuntime(config: AppConfig): RuntimeSettings {
  const chatModels: ChatModelEntry[] = config.chatModels.map((e) => ({
    id: e.id,
    label: e.label,
    tier: e.tier,
    transport: e.transport,
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
    ollamaHost: config.ollamaHost,
    llmProvider: {
      kind: "openai-compatible",
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
  const host = runtime.ollamaHost.trim() || "http://127.0.0.1:11434"
  configureOllamaHost(host)
  resetOllamaClient()
  return config
}
