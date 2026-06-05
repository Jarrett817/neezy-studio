import type { ChatModelEntry } from "./chat-model-entry"
import { normalizeMainChatModels } from "./chat-model-entry"
import { getSyncedRuntimeSettings, type RuntimeSettings } from "./runtime-settings"

function listConfiguredChatModels(settings: RuntimeSettings): ChatModelEntry[] {
  return normalizeMainChatModels({
    chatModels: settings.chatModels,
    llmProvider: settings.llmProvider,
  })
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
  modelId: string
} {
  const settings = getSyncedRuntimeSettings()
  const entry = resolveChatModelEntry(settings)
  return {
    entry,
    modelId: entry?.model.trim() ?? "",
  }
}

export function resolveActiveChatModelId(settings: RuntimeSettings): string {
  return resolveChatModelEntry(settings)?.model.trim() ?? ""
}
