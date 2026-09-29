import {
  getBuiltinModel,
  getBuiltinModels,
  getBuiltinProviders,
} from "@earendil-works/pi-ai/providers/all"
import type { Api, KnownProvider, Model } from "@earendil-works/pi-ai"
import {
  inferChatApiKind,
  resolveChatApiBaseUrl,
  resolvePiProvider,
  type ChatApiKind,
} from "../shared/chat-api-route"
import { dashScopeModelUsesThinking, isDashScopeOpenAiBaseUrl } from "../shared/coding-plan-catalog"
import { resolveEntryApiBase, type ChatModelEntry } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import { buildDashScopeCompat, withDashScopeCompat } from "./dashscope-compat"

const EMPTY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

function resolveEntryBaseUrl(
  entry: NonNullable<ReturnType<typeof resolveActiveChatRoute>["entry"]>
): string {
  const settings = getSyncedRuntimeSettings()
  return resolveEntryApiBase(entry, settings.llmProvider)
}

function isKnownProvider(provider: string): provider is KnownProvider {
  return (getBuiltinProviders() as readonly string[]).includes(provider)
}

function findPiCatalogModel(
  provider: KnownProvider,
  modelId: string
): Model<Api> | undefined {
  const direct = getBuiltinModel(provider, modelId as never)
  if (direct) return direct as Model<Api>

  const needle = modelId.trim().toLowerCase()
  return getBuiltinModels(provider).find((m) => m.id.toLowerCase() === needle) as
    | Model<Api>
    | undefined
}

/** 自定义端点时：按 modelId 在 pi-ai 全目录回查 context/maxTokens（供应商元数据来自目录，非运行时探测） */
function lookupCatalogModelById(modelId: string): Model<Api> | undefined {
  const needle = modelId.trim().toLowerCase()
  if (!needle) return undefined
  for (const provider of getBuiltinProviders() as readonly string[]) {
    if (!isKnownProvider(provider)) continue
    const hit = getBuiltinModels(provider).find((m) => {
      const id = m.id.toLowerCase()
      return id === needle || id.endsWith(`/${needle}`) || id.split("/").pop() === needle
    })
    if (hit) return hit as Model<Api>
  }
  return undefined
}

function fallbackAnthropicTemplate(provider: KnownProvider): Model<Api> | undefined {
  if (provider === "minimax-cn") {
    return getBuiltinModel("minimax-cn", "MiniMax-M2.7") as Model<Api> | undefined
  }
  return getBuiltinModels(provider).find(
    (m) => m.api === "anthropic-messages"
  ) as Model<Api> | undefined
}

function buildApiModel(
  modelId: string,
  apiKind: ChatApiKind,
  baseUrl: string,
  provider: string,
  reasoning: boolean,
  compat?: Record<string, unknown>
): Model<Api> {
  // 优先用 pi-ai 内置目录里该模型的上限；目录没有才退保守默认（不假装探测到了供应商）
  const catalog = lookupCatalogModelById(modelId)
  const contextWindow = catalog?.contextWindow ?? 128_000
  const maxTokens = catalog?.maxTokens ?? 16_384

  // 自定义 OpenAI 兼容端点：走 max_tokens（多数网关不认 max_completion_tokens）
  // finish_reason：pi 默认严格要求，部分网关末包省略 → 用官方 compat 关闭
  const openaiCompatDefaults =
    apiKind === "openai-completions"
      ? {
          maxTokensField: "max_tokens" as const,
          supportsFinishReason: false,
          supportsUsageInStreaming: false,
          supportsStore: false,
        }
      : undefined

  return {
    id: modelId,
    name: modelId,
    api: apiKind,
    provider,
    baseUrl,
    reasoning: reasoning || Boolean(catalog?.reasoning),
    input: catalog?.input?.length ? [...catalog.input] : ["text"],
    cost: catalog?.cost ?? EMPTY_COST,
    contextWindow,
    maxTokens,
    ...(openaiCompatDefaults || compat
      ? { compat: { ...openaiCompatDefaults, ...(compat ?? {}) } }
      : {}),
  } as Model<Api>
}

function withUserContextWindow(
  model: Model<Api>,
  entry: ChatModelEntry
): Model<Api> {
  const cw = entry.contextWindow
  if (typeof cw !== "number" || !Number.isFinite(cw) || cw <= 0) return model
  return { ...model, contextWindow: Math.floor(cw) }
}

/** 从统一模型条目解析 pi-ai Model（优先使用 pi-ai 内置目录） */
export function resolvePiChatModel(_userMessage?: string): Model<Api> {
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute()
  const entry = route.entry
  const modelId = route.modelId
  if (!entry || !modelId) {
    throw new Error("请先在「模型与连接」配置 API 对话模型")
  }

  const base = resolveEntryBaseUrl(entry)
  const apiKind = inferChatApiKind(base)
  const baseUrl = resolveChatApiBaseUrl(base, apiKind)
  const preset = entry.preset?.trim() || settings.llmProvider.preset || "custom"
  const provider = resolvePiProvider(preset, apiKind, base)

  if (isKnownProvider(provider)) {
    const catalog =
      findPiCatalogModel(provider, modelId) ?? fallbackAnthropicTemplate(provider)
    if (catalog) {
      return withUserContextWindow(
        withDashScopeCompat(
          { ...catalog, id: modelId, name: modelId, baseUrl },
          modelId,
          baseUrl
        ),
        entry
      )
    }
  }

  const reasoning =
    apiKind === "anthropic-messages" && provider === "minimax-cn"
      ? true
      : isDashScopeOpenAiBaseUrl(baseUrl) && dashScopeModelUsesThinking(modelId)

  const dashScopeCompat = isDashScopeOpenAiBaseUrl(baseUrl)
    ? buildDashScopeCompat()
    : undefined

  return withUserContextWindow(
    withDashScopeCompat(
      buildApiModel(modelId, apiKind, baseUrl, provider, reasoning, dashScopeCompat),
      modelId,
      baseUrl
    ),
    entry
  )
}

/**
 * 百炼 Agent 工具流式易缺 finish_reason；默认关闭 thinking 并显式 enable_thinking=false。
 */
export function resolveAgentThinkingLevel(model: Model<Api>): "off" | "medium" {
  if (isDashScopeOpenAiBaseUrl(model.baseUrl ?? "") && dashScopeModelUsesThinking(model.id)) {
    return "off"
  }
  return model.reasoning ? "medium" : "off"
}
