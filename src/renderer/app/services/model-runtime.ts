import {
  getModelCatalog,
  unloadEmbeddingModel,
  type ChatLoadResult,
  type ModelCatalogItem,
} from "~/services/electron-client"
import {
  getCurrentModel,
  isElectronLlmAvailable,
  loadModel,
  unloadModel,
} from "~/services/llm"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"

const LEGACY_CHAT_MODEL_KEY = "neezy-llm-last-model"

async function migrateLegacyChatPreference() {
  const legacy = localStorage.getItem(LEGACY_CHAT_MODEL_KEY)
  if (!legacy) return
  const settings = await getRuntimeSettings()
  if (!settings.llmModel) {
    await saveRuntimeSettings({ ...settings, llmModel: legacy })
  }
  localStorage.removeItem(LEGACY_CHAT_MODEL_KEY)
}

/** 应用启动时仅自动加载已启用的对话模型 */
export async function bootstrapRuntimeModels(): Promise<void> {
  if (!isElectronLlmAvailable()) return

  await migrateLegacyChatPreference()
  const settings = await getRuntimeSettings()
  const chatCatalog = await getModelCatalog("chat")

  if (settings.llmModel && getCurrentModel() !== settings.llmModel) {
    const chat = chatCatalog.find(
      (m) => m.fileName === settings.llmModel && m.installed
    )
    if (chat) {
      await loadModel(settings.llmModel).catch((error) =>
        console.warn("[LLM] Auto-start failed:", error)
      )
    }
  }
}

export function isChatModelRunning(fileName: string): boolean {
  return getCurrentModel() === fileName
}

export async function startChatModel(
  item: ModelCatalogItem
): Promise<ChatLoadResult | undefined> {
  if (getCurrentModel() !== item.fileName) {
    await unloadModel()
  }
  await unloadEmbeddingModel().catch(() => {})
  const loadInfo = await loadModel(item.fileName)
  const settings = await getRuntimeSettings()
  await saveRuntimeSettings({
    ...settings,
    llmModel: item.fileName,
    chatTier: item.tier,
  })
  return loadInfo
}

export async function stopChatModel(fileName?: string): Promise<void> {
  if (fileName && getCurrentModel() !== fileName) return
  await unloadModel()
  const settings = await getRuntimeSettings()
  if (settings.llmModel === (fileName ?? settings.llmModel)) {
    await saveRuntimeSettings({
      ...settings,
      llmModel: "",
      chatTier: "",
    })
  }
}

/** 选用向量模型（仅写入配置，检索时按需加载并立即释放） */
export async function startEmbeddingModel(item: ModelCatalogItem): Promise<void> {
  const settings = await getRuntimeSettings()
  await saveRuntimeSettings({
    ...settings,
    embeddingModel: item.fileName,
    embeddingTier: item.tier,
  })
}

/** 取消选用向量模型 */
export async function stopEmbeddingModel(fileName?: string): Promise<void> {
  const settings = await getRuntimeSettings()
  if (fileName && settings.embeddingModel !== fileName) return
  await unloadEmbeddingModel().catch(() => {})
  await saveRuntimeSettings({
    ...settings,
    embeddingModel: "",
    embeddingTier: "",
  })
}
