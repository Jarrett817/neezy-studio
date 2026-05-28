// 运行时设置 - SQLite storage

import { configureOllamaHost, syncRuntimeSettingsToMain } from "~/services/electron-client"
import {
  DEFAULT_LLM_PROVIDER,
  normalizeLlmProvider,
  type LlmProviderConfig,
  type LlmProviderKind,
} from "~/services/llm-provider"
import { getSetting, setSetting } from "~/services/storage/settings-store"

export type ModelTier = "light" | "balanced" | "performance"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  /** Ollama 模式下的对话模型名 */
  llmModel: string
  /** Ollama Embedding 模型名（记忆向量检索） */
  embeddingModel: string
  chatTier: ModelTier | ""
  embeddingTier: ModelTier | ""
  /** 仅 Ollama 模式：本地 serve 地址 */
  ollamaHost: string
  /** 对话模型来源：Coding Plan / 自定义 OpenAI 兼容，或本地 Ollama */
  llmProvider: LlmProviderConfig
  /** 与 llmProvider.kind 同步写入，防止嵌套对象丢失时回退成 API */
  chatProviderKind?: LlmProviderConfig["kind"]
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  llmModel: "",
  embeddingModel: "",
  chatTier: "",
  embeddingTier: "",
  ollamaHost: "http://127.0.0.1:11434",
  llmProvider: DEFAULT_LLM_PROVIDER,
}

function resolveStoredProviderKind(
  stored: Partial<RuntimeSettings> | null
): LlmProviderKind {
  const fromNested = stored?.llmProvider?.kind
  if (fromNested === "ollama" || fromNested === "openai-compatible") {
    return fromNested
  }
  const fromTop = stored?.chatProviderKind
  if (fromTop === "ollama" || fromTop === "openai-compatible") {
    return fromTop
  }
  return DEFAULT_LLM_PROVIDER.kind
}

function mergeRuntimeSettings(
  stored: Partial<RuntimeSettings> | null
): RuntimeSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
  }
  const provider = normalizeLlmProvider({
    ...DEFAULT_LLM_PROVIDER,
    ...(stored?.llmProvider ?? {}),
    kind: resolveStoredProviderKind(stored),
  })
  const llmProvider =
    provider.kind === "ollama" && merged.llmModel.trim()
      ? { ...provider, model: merged.llmModel.trim() }
      : provider
  return {
    ...merged,
    llmProvider,
    chatProviderKind: llmProvider.kind,
  }
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settings = await getSetting<RuntimeSettings>("runtime_settings")
  return mergeRuntimeSettings(settings)
}

export async function saveRuntimeSettings(
  settings: RuntimeSettings
): Promise<RuntimeSettings> {
  const merged = mergeRuntimeSettings(settings)
  await setSetting("runtime_settings", merged)
  await syncRuntimeSettingsToMain(merged)
  if (merged.llmProvider.kind === "ollama" && merged.ollamaHost.trim()) {
    await configureOllamaHost(merged.ollamaHost.trim())
  }
  return merged
}

export async function pushRuntimeSettingsToMain(): Promise<void> {
  const settings = await getRuntimeSettings()
  await syncRuntimeSettingsToMain(settings)
  if (settings.llmProvider.kind === "ollama" && settings.ollamaHost.trim()) {
    await configureOllamaHost(settings.ollamaHost.trim())
  }
}
