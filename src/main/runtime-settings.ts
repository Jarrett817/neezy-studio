import type { ChatModelEntry } from "./chat-model-entry"

export interface LlmProviderConfig {
  preset: string
  baseUrl: string
  apiKey: string
  model: string
}

export type ModelTier = "light" | "balanced" | "performance"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  activeChatModelId: string
  llmProvider: LlmProviderConfig
  chatModels?: ChatModelEntry[]
}

const DEFAULT_PROVIDER: LlmProviderConfig = {
  preset: "custom",
  baseUrl: "",
  apiKey: "",
  model: "",
}

const DEFAULT: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  activeChatModelId: "",
  llmProvider: DEFAULT_PROVIDER,
}

let cache: RuntimeSettings = { ...DEFAULT, llmProvider: { ...DEFAULT_PROVIDER } }

export function syncRuntimeSettings(input: RuntimeSettings): void {
  const provider = input.llmProvider
  cache = {
    ...DEFAULT,
    ...input,
    chatModels: input.chatModels,
    activeChatModelId: input.activeChatModelId?.trim() ?? "",
    llmProvider: {
      preset: provider.preset || DEFAULT_PROVIDER.preset,
      baseUrl: (provider.baseUrl || DEFAULT_PROVIDER.baseUrl).replace(/\/$/, ""),
      apiKey: provider.apiKey ?? "",
      model: provider.model?.trim() || DEFAULT_PROVIDER.model,
    },
  }
}

export function getSyncedRuntimeSettings(): RuntimeSettings {
  return cache
}

export function resolveOpenAiBaseUrl(): string {
  const base = cache.llmProvider.baseUrl.trim()
  if (!base) throw new Error("未配置 API Base URL")
  return base.replace(/\/$/, "")
}

export function resolveOpenAiV1Base(): string {
  const base = resolveOpenAiBaseUrl()
  return base.endsWith("/v1") ? base : `${base}/v1`
}
