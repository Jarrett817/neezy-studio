import { resolveProviderBaseUrl } from "./llm-presets"

export type LlmProviderKind = "ollama" | "openai-compatible"

export interface LlmProviderConfig {
  kind: LlmProviderKind
  preset: string
  baseUrl: string
  apiKey: string
  model: string
}

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  llmModel: string
  embeddingModel: string
  chatTier: string
  embeddingTier: string
  ollamaHost: string
  llmProvider: LlmProviderConfig
}

const DEFAULT_PROVIDER: LlmProviderConfig = {
  kind: "openai-compatible",
  preset: "zhipu-coding",
  baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
  apiKey: "",
  model: "GLM-4.7",
}

const DEFAULT: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  llmModel: "",
  embeddingModel: "",
  chatTier: "",
  embeddingTier: "",
  ollamaHost: "http://127.0.0.1:11434",
  llmProvider: DEFAULT_PROVIDER,
}

let cache: RuntimeSettings = { ...DEFAULT, llmProvider: { ...DEFAULT_PROVIDER } }

export function syncRuntimeSettings(input: RuntimeSettings): void {
  const provider = input.llmProvider
  cache = {
    ...DEFAULT,
    ...input,
    llmProvider: {
      kind: provider.kind,
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

export function usesOpenAiCompatibleChat(): boolean {
  return cache.llmProvider.kind === "openai-compatible"
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
