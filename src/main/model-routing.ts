import type { ChatModelEntry } from "./chat-model-entry"
import { normalizeMainChatModels } from "./chat-model-entry"
import {
  getSyncedRuntimeSettings,
  type LlmProviderKind,
  type ModelTier,
  type RuntimeSettings,
} from "./runtime-settings"

export type ChatTierMode = "fixed" | "auto"

const TIER_ORDER: ModelTier[] = ["light", "balanced", "performance"]

export function pickTierForPrompt(message: string): ModelTier {
  const text = message.trim()
  const len = text.length
  if (len < 80) return "light"
  if (
    len < 500 &&
    !/分析|详细|复杂|架构|重构|代码|推理|长文|报告|方案/.test(text)
  ) {
    return "balanced"
  }
  return "performance"
}

export function resolveTierForChat(
  settings: RuntimeSettings,
  userMessage?: string
): ModelTier {
  const mode = settings.chatTierMode ?? "auto"
  if (mode === "fixed" && settings.chatTier) {
    return settings.chatTier as ModelTier
  }
  if (mode === "fixed") return "balanced"
  if (userMessage?.trim()) return pickTierForPrompt(userMessage)
  return "balanced"
}

function listChatModels(settings: RuntimeSettings): ChatModelEntry[] {
  return normalizeMainChatModels(settings)
}

function pickCandidatesForTier(
  models: ChatModelEntry[],
  tier: ModelTier
): ChatModelEntry[] {
  const exact = models.filter((e) => e.tier === tier)
  if (exact.length) return exact
  return models
}

export function resolveChatModelEntry(
  settings: RuntimeSettings,
  userMessage?: string
): ChatModelEntry | null {
  const models = listChatModels(settings)
  if (!models.length) return null

  const tier = resolveTierForChat(settings, userMessage)
  const candidates = pickCandidatesForTier(models, tier)
  if (candidates.length === 1) return candidates[0]
  const seed = userMessage?.trim().length ?? 0
  return candidates[seed % candidates.length] ?? candidates[0]
}

export function resolveActiveChatRoute(userMessage?: string): {
  tier: ModelTier
  entry: ChatModelEntry | null
  backend: LlmProviderKind
  modelId: string
} {
  const settings = getSyncedRuntimeSettings()
  const tier = resolveTierForChat(settings, userMessage)
  const entry = resolveChatModelEntry(settings, userMessage)
  return {
    tier,
    entry,
    backend: entry?.transport ?? "openai-compatible",
    modelId: entry?.model.trim() ?? "",
  }
}

export function listConfiguredTiers(settings: RuntimeSettings): ModelTier[] {
  const models = listChatModels(settings)
  return TIER_ORDER.filter((tier) => models.some((m) => m.tier === tier))
}

export function resolveActiveChatModelId(
  settings: RuntimeSettings,
  userMessage?: string
): string {
  return resolveChatModelEntry(settings, userMessage)?.model.trim() ?? ""
}

/** 当前路由是否走 OpenAI 兼容 API（非 Ollama 网关） */
export function resolvedChatUsesApi(userMessage?: string): boolean {
  const entry = resolveActiveChatRoute(userMessage).entry
  if (entry) return entry.transport === "openai-compatible"
  return getSyncedRuntimeSettings().llmProvider.kind === "openai-compatible"
}
