import type { ChatModelEntry } from "./chat-model-entry"
import { normalizeMainChatModels } from "./chat-model-entry"
import {
  getSyncedRuntimeSettings,
  type LlmProviderKind,
  type RuntimeSettings,
} from "./runtime-settings"

function listChatModels(settings: RuntimeSettings): ChatModelEntry[] {
  return normalizeMainChatModels(settings)
}

function listConfiguredChatModels(settings: RuntimeSettings): ChatModelEntry[] {
  return listChatModels(settings).filter((e) => e.enabled && e.model.trim())
}

export function resolveChatModelEntry(settings: RuntimeSettings): ChatModelEntry | null {
  const configured = listConfiguredChatModels(settings)
  if (!configured.length) return null

  const activeId = settings.activeChatModelId?.trim() ?? ""
  if (activeId) {
    const found = configured.find((e) => e.id === activeId)
    if (found) return found
  }
  return configured[0]
}

export function resolveActiveChatRoute(): {
  entry: ChatModelEntry | null
  backend: LlmProviderKind
  modelId: string
} {
  const settings = getSyncedRuntimeSettings()
  const entry = resolveChatModelEntry(settings)
  return {
    entry,
    backend: entry?.transport ?? "openai-compatible",
    modelId: entry?.model.trim() ?? "",
  }
}

export function resolveActiveChatModelId(settings: RuntimeSettings): string {
  return resolveChatModelEntry(settings)?.model.trim() ?? ""
}

/** 当前路由是否走 OpenAI 兼容 API（非 Ollama 网关） */
export function resolvedChatUsesApi(): boolean {
  const entry = resolveActiveChatRoute().entry
  if (entry) return entry.transport === "openai-compatible"
  return getSyncedRuntimeSettings().llmProvider.kind === "openai-compatible"
}
