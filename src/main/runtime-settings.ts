import type { ChatModelEntry } from "./chat-model-entry"
import { resolveProviderBaseUrl } from "./llm-presets"

export type LlmProviderKind = "ollama" | "openai-compatible"

export interface LlmProviderConfig {
  kind: LlmProviderKind
  preset: string
  baseUrl: string
  apiKey: string
  model: string
}

export type ModelTier = "light" | "balanced" | "performance"

export type ChatTierMode = "fixed" | "auto"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  chatTier: string
  ollamaHost: string
  llmProvider: LlmProviderConfig
  chatModels?: ChatModelEntry[]
  chatTierMode?: ChatTierMode
}

const DEFAULT_PROVIDER: LlmProviderConfig = {
  kind: "openai-compatible",
  preset: "custom",
  baseUrl: "",
  apiKey: "",
  model: "",
}

const DEFAULT: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  chatTier: "",
  ollamaHost: "http://127.0.0.1:11434",
  llmProvider: DEFAULT_PROVIDER,
  chatTierMode: "auto",
}

let cache: RuntimeSettings = { ...DEFAULT, llmProvider: { ...DEFAULT_PROVIDER } }

export function syncRuntimeSettings(input: RuntimeSettings): void {
  const provider = input.llmProvider
  cache = {
    ...DEFAULT,
    ...input,
    chatModels: input.chatModels,
    chatTierMode:
      input.chatTierMode === "fixed" || input.chatTierMode === "auto"
        ? input.chatTierMode
        : cache.chatTierMode ?? "auto",
    llmProvider: {
      kind: "openai-compatible",
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
  const base = resolveProviderBaseUrl(cache.llmProvider)
  if (!base) throw new Error("未配置 API Base URL")
  return base
}

export function resolveOpenAiV1Base(): string {
  const base = resolveOpenAiBaseUrl()
  return base.endsWith("/v1") ? base : `${base}/v1`
}
