import {
  getModel,
  getModels,
  getProviders,
  type Api,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai"

import {
  inferChatApiKind,
  resolveChatApiBaseUrl,
  resolvePiProvider,
  type ChatApiKind,
} from "../shared/chat-api-route"
import { resolveEntryApiBase } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import { getSyncedRuntimeSettings } from "./runtime-settings"

const EMPTY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

function resolveEntryBaseUrl(
  entry: NonNullable<ReturnType<typeof resolveActiveChatRoute>["entry"]>
): string {
  const settings = getSyncedRuntimeSettings()
  return resolveEntryApiBase(entry, settings.llmProvider)
}

function isKnownProvider(provider: string): provider is KnownProvider {
  return (getProviders() as readonly string[]).includes(provider)
}

function findPiCatalogModel(provider: KnownProvider, modelId: string): Model<Api> | undefined {
  const direct = getModel(provider, modelId as never)
  if (direct) return direct as Model<Api>

  const needle = modelId.trim().toLowerCase()
  return getModels(provider).find((m) => m.id.toLowerCase() === needle) as Model<Api> | undefined
}

function fallbackAnthropicTemplate(provider: KnownProvider): Model<Api> | undefined {
  if (provider === "minimax-cn") {
    return getModel("minimax-cn", "MiniMax-M2.7") as Model<Api> | undefined
  }
  return getModels(provider).find((m) => m.api === "anthropic-messages") as Model<Api> | undefined
}

function buildApiModel(
  modelId: string,
  apiKind: ChatApiKind,
  baseUrl: string,
  provider: string,
  reasoning: boolean
): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api: apiKind,
    provider,
    baseUrl,
    reasoning,
    input: ["text"],
    cost: EMPTY_COST,
    contextWindow: 204_800,
    maxTokens: 131_072,
  } as Model<Api>
}

/** 从统一模型条目解析 pi-ai Model（优先使用 pi-ai 内置目录） */
export function resolvePiChatModel(userMessage?: string): Model<Api> {
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute(userMessage)
  const entry = route.entry
  const modelId = route.modelId || "qwen2.5:7b"

  if (entry?.transport === "openai-compatible") {
    const base = resolveEntryBaseUrl(entry)
    const apiKind = inferChatApiKind(base)
    const baseUrl = resolveChatApiBaseUrl(base, apiKind)
    const preset = entry.preset?.trim() || settings.llmProvider.preset || "custom"
    const provider = resolvePiProvider(preset, apiKind, base)

    if (isKnownProvider(provider)) {
      const catalog =
        findPiCatalogModel(provider, modelId) ?? fallbackAnthropicTemplate(provider)
      if (catalog) {
        return {
          ...catalog,
          id: modelId,
          name: modelId,
          baseUrl,
        }
      }
    }

    const reasoning = apiKind === "anthropic-messages" && provider === "minimax-cn"
    return buildApiModel(modelId, apiKind, baseUrl, provider, reasoning)
  }

  const ollamaBase = (settings.ollamaHost || "http://127.0.0.1:11434").replace(/\/$/, "")
  return buildApiModel(modelId, "openai-completions", `${ollamaBase}/v1`, "ollama", false)
}

/** 推理模型需开启 Agent thinkingLevel；勿对 MiniMax 使用 forceAdaptiveThinking（会发 Claude adaptive 参数导致无流式输出） */
export function resolveAgentThinkingLevel(model: Model<Api>): "off" | "medium" {
  return model.reasoning ? "medium" : "off"
}
