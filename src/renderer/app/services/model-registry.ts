import {
  enforceChatModelRules,
  type ChatModelEntry,
} from "~/config/chat-models"
import {
  getRuntimeSettings,
  saveRuntimeSettings,
  type ChatTierMode,
  type ModelTier,
  type RuntimeSettings,
} from "~/services/settings"

export interface ModelRegistrySnapshot {
  activeTier: ModelTier | ""
  chatTierMode: ChatTierMode
  chatModels: ChatModelEntry[]
  ollamaHost: string
  apiModel: string
  apiPreset: string
  apiBaseUrl: string
  apiKey: string
}

export async function loadModelRegistry(): Promise<ModelRegistrySnapshot> {
  const s = await getRuntimeSettings()
  return {
    activeTier: s.chatTier,
    chatTierMode: s.chatTierMode,
    chatModels: s.chatModels,
    ollamaHost: s.ollamaHost,
    apiModel: s.llmProvider.model,
    apiPreset: s.llmProvider.preset,
    apiBaseUrl: s.llmProvider.baseUrl,
    apiKey: s.llmProvider.apiKey,
  }
}

export async function saveChatModels(
  models: ChatModelEntry[],
  patch?: {
    chatTierMode?: ChatTierMode
    activeTier?: ModelTier | ""
    ollamaHost?: string
  }
): Promise<RuntimeSettings> {
  const prev = await getRuntimeSettings()
  return saveRuntimeSettings({
    ...prev,
    chatModels: enforceChatModelRules(models),
    chatTierMode: patch?.chatTierMode ?? prev.chatTierMode,
    chatTier: patch?.activeTier !== undefined ? patch.activeTier : prev.chatTier,
    ollamaHost: patch?.ollamaHost ?? prev.ollamaHost,
  })
}

export async function applyModelRegistry(
  patch: Partial<ModelRegistrySnapshot> & { chatModels?: ChatModelEntry[] }
): Promise<RuntimeSettings> {
  const prev = await getRuntimeSettings()
  const models = enforceChatModelRules(patch.chatModels ?? prev.chatModels)
  return saveRuntimeSettings({
    ...prev,
    chatModels: models,
    chatTierMode: patch.chatTierMode ?? prev.chatTierMode,
    chatTier: patch.activeTier !== undefined ? patch.activeTier : prev.chatTier,
    ollamaHost: patch.ollamaHost ?? prev.ollamaHost,
    llmProvider: {
      ...prev.llmProvider,
      preset: patch.apiPreset ?? prev.llmProvider.preset,
      baseUrl: patch.apiBaseUrl ?? prev.llmProvider.baseUrl,
      apiKey: patch.apiKey ?? prev.llmProvider.apiKey,
      model: patch.apiModel ?? prev.llmProvider.model,
    },
  })
}
