import type { Model } from "@earendil-works/pi-ai"

import { resolveProviderBaseUrl } from "./llm-presets"
import { getSyncedRuntimeSettings, usesOpenAiCompatibleChat } from "./runtime-settings"

const EMPTY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** 从 runtime_settings 解析 pi-ai Model（Ollama OpenAI 兼容层或远程 OpenAI 兼容 API）。 */
export function resolvePiChatModel(): Model<"openai-responses"> | Model<"openai-completions"> {
  const settings = getSyncedRuntimeSettings()
  const provider = settings.llmProvider
  const useRemote = usesOpenAiCompatibleChat()

  const modelId = useRemote
    ? provider.model.trim() || "GLM-4.7"
    : settings.llmModel.trim() || "qwen2.5:7b"

  if (useRemote) {
    const openAiBase = resolveProviderBaseUrl(provider).replace(/\/$/, "")
    const baseUrl = openAiBase.endsWith("/v1") ? openAiBase : `${openAiBase}/v1`
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider: provider.preset || "openai",
      baseUrl,
      apiKey: provider.apiKey.trim(),
      reasoning: false,
      input: ["text"],
      cost: EMPTY_COST,
      contextWindow: 128_000,
      maxTokens: 8192,
    } as Model<"openai-completions">
  }

  const baseUrl = `${(settings.ollamaHost || "http://127.0.0.1:11434").replace(/\/$/, "")}/v1`
  return {
    id: modelId,
    name: modelId,
    api: "openai-responses",
    provider: "ollama",
    baseUrl,
    apiKey: "ollama",
    reasoning: false,
    input: ["text"],
    cost: EMPTY_COST,
    contextWindow: 8192,
    maxTokens: 8192,
  } as Model<"openai-responses">
}
