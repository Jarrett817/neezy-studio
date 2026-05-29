import {
  loadEmbeddingModel as loadEmbeddingInMain,
  type ChatLoadResult,
  type ModelCatalogItem,
} from "~/services/electron-client"
import {
  createChatModelEntry,
  enforceChatModelRules,
} from "~/config/chat-models"
import {
  getCurrentModel,
  isElectronLlmAvailable,
  loadModel,
  unloadModel,
} from "~/services/llm"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"

/** 应用启动时预加载内置 Embedding（node-llama-cpp） */
export async function bootstrapRuntimeModels(): Promise<void> {
  if (!isElectronLlmAvailable()) return
  await loadEmbeddingInMain().catch((error) =>
    console.warn("[LLM] 内置 Embedding 预加载失败:", error)
  )
}

function ollamaRef(item: ModelCatalogItem): string {
  return item.path?.trim() || item.fileName
}

export function isChatModelRunning(fileName: string): boolean {
  const current = getCurrentModel()
  return current === fileName
}

export function isCatalogItemRunning(item: ModelCatalogItem): boolean {
  const current = getCurrentModel()
  const ref = ollamaRef(item)
  return current === ref || current === item.fileName
}

export async function startChatModel(
  item: ModelCatalogItem
): Promise<ChatLoadResult | undefined> {
  const ref = ollamaRef(item)
  if (getCurrentModel() !== ref) {
    await unloadModel()
  }
  const loadInfo = await loadModel(ref)
  const settings = await getRuntimeSettings()
  const tier = item.tier as "light" | "balanced" | "performance"
  const withoutOllama = settings.chatModels.filter((m) => m.transport !== "ollama")
  const chatModels = enforceChatModelRules([
    ...withoutOllama,
    createChatModelEntry({
      label: item.title ?? item.fileName,
      tier,
      transport: "ollama",
      model: ref,
      enabled: true,
    }),
  ])
  await saveRuntimeSettings({
    ...settings,
    chatTier: item.tier,
    chatModels,
  })
  return loadInfo
}

export async function stopChatModel(fileName?: string): Promise<void> {
  const settings = await getRuntimeSettings()
  const ollama = settings.chatModels.find((m) => m.transport === "ollama")
  if (ollama && (!fileName || ollama.model === fileName)) {
    await saveRuntimeSettings({
      ...settings,
      chatModels: settings.chatModels.map((m) =>
        m.transport === "ollama" ? { ...m, enabled: false } : m
      ),
    })
  }
  await unloadModel()
}
