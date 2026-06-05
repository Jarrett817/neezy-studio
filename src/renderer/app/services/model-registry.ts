import {
  enforceChatModelRules,
  isEntryConfigured,
  type ChatModelEntry,
} from "~/config/chat-models"
import {
  getRuntimeSettings,
  listConfiguredChatModels,
  saveRuntimeSettings,
  type RuntimeSettings,
} from "~/services/settings"

export interface ModelRegistrySnapshot {
  activeChatModelId: string
  chatModels: ChatModelEntry[]
  apiModel: string
  apiPreset: string
  apiBaseUrl: string
  apiKey: string
}

function resolveActiveId(
  models: ChatModelEntry[],
  llmProvider: RuntimeSettings["llmProvider"],
  preferredId: string
): string {
  const configured = models.filter(
    (e) => e.enabled && e.model.trim() && isEntryConfigured(e, llmProvider)
  )
  const id = preferredId.trim()
  if (id && configured.some((e) => e.id === id)) return id
  return configured[0]?.id ?? ""
}

export async function loadModelRegistry(): Promise<ModelRegistrySnapshot> {
  const s = await getRuntimeSettings()
  return {
    activeChatModelId: s.activeChatModelId,
    chatModels: s.chatModels,
    apiModel: s.llmProvider.model,
    apiPreset: s.llmProvider.preset,
    apiBaseUrl: s.llmProvider.baseUrl,
    apiKey: s.llmProvider.apiKey,
  }
}

export async function saveChatModels(
  models: ChatModelEntry[],
  patch?: {
    activeChatModelId?: string
  }
): Promise<RuntimeSettings> {
  const prev = await getRuntimeSettings()
  const chatModels = enforceChatModelRules(models)
  const activeChatModelId = resolveActiveId(
    chatModels,
    prev.llmProvider,
    patch?.activeChatModelId ?? prev.activeChatModelId
  )
  return saveRuntimeSettings({
    ...prev,
    chatModels,
    activeChatModelId,
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
    activeChatModelId: resolveActiveId(
      models,
      prev.llmProvider,
      patch.activeChatModelId ?? prev.activeChatModelId
    ),
    llmProvider: {
      ...prev.llmProvider,
      preset: patch.apiPreset ?? prev.llmProvider.preset,
      baseUrl: patch.apiBaseUrl ?? prev.llmProvider.baseUrl,
      apiKey: patch.apiKey ?? prev.llmProvider.apiKey,
      model: patch.apiModel ?? prev.llmProvider.model,
    },
  })
}

export function pickDefaultActiveModelId(settings: RuntimeSettings): string {
  return listConfiguredChatModels(settings)[0]?.id ?? ""
}
