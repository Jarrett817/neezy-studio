import { AuthStorage } from "@earendil-works/pi-coding-agent"

import { resolveEntryApiKey } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import { OLLAMA_PI_API_KEY } from "./pi-llm"
import { resolvePiChatModel } from "./pi-model"
import { getSyncedRuntimeSettings } from "./runtime-settings"

let authStorage: AuthStorage | null = null

export function getPiAuthStorage(): AuthStorage {
  if (!authStorage) {
    authStorage = AuthStorage.inMemory()
  }
  return authStorage
}

/** 将 Neezy runtime_settings 同步到 Pi AuthStorage（不落盘 ~/.pi） */
export function syncPiAuthForRoute(userMessage?: string): void {
  const storage = getPiAuthStorage()
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute(userMessage)
  const model = resolvePiChatModel(userMessage)

  if (route.entry?.transport === "openai-compatible") {
    const key = resolveEntryApiKey(route.entry, settings.llmProvider)
    if (key) {
      storage.setRuntimeApiKey(model.provider, key)
    }
    return
  }

  if (model.provider === "ollama") {
    storage.setRuntimeApiKey("ollama", OLLAMA_PI_API_KEY)
  }
}
