import { mergeStreamThinking } from "~/lib/agent-steps"
import {
  chatPromptFromMain,
  chatPromptStreamFromMain,
  resetChatHistoryFromMain,
  getChatModelFileInfo,
  type ChatSyncMessage,
  getEmbeddingsFromMain,
  getModelCatalog,
  getModelRecommendations,
  isElectronApp,
  listLlmModels as listLocalLlmModels,
  loadChatModel as loadChatModelInMain,
  loadEmbeddingModel as loadEmbeddingModelInMain,
  primeChatHistoryFromMain,
  onChatStreamFromMain,
  unloadChatModel as unloadChatModelInMain,
  unloadEmbeddingModel as unloadEmbeddingModelInMain,
  type ChatLoadResult,
  type ModelCatalogItem,
} from "~/services/electron-client"
import { getRuntimeSettings } from "~/services/settings"

export type LlmModel = {
  id: string
  name: string
  path?: string
  description?: string
}

export type ModelProgress = {
  progress?: number
  text?: string
  timeElapsed?: number
}

export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type LoadingState = {
  isLoading: boolean
  loadingModelId: string | null
  progress: ModelProgress | null
}

let currentModel: string | null = null
let syncedMessageCount = 0
let loadingState: LoadingState = {
  isLoading: false,
  loadingModelId: null,
  progress: null,
}
let lastUsedTime = 0

const HOT_CACHE_THRESHOLD_MS = 30 * 60 * 1000
/** 发给主进程的历史条数上限，避免长对话拖慢首 token */
const CHAT_PRIME_MESSAGE_LIMIT = 24
const loadingListeners = new Set<(state: LoadingState) => void>()

function formatLlmLoadError(error: unknown, fileName: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "模型加载失败"
  const nested = raw.replace(/^Error:\s*/i, "").trim()
  if (/Failed to load|InsufficientMemory|out of memory|显存|VRAM/i.test(nested)) {
    return [
      `无法加载 ${fileName}。`,
      "请确认 Ollama 已运行、模型已 pull，并尝试更小模型或释放显存。",
    ].join(" ")
  }
  return nested || "模型加载失败"
}

/** 渲染进程且在 Electron 壳内 */
export function isElectronLlmAvailable(): boolean {
  return isElectronApp()
}

function notifyLoadingState() {
  loadingListeners.forEach((listener) => listener({ ...loadingState }))
}

function formatPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const role =
        message.role === "assistant"
          ? "Assistant"
          : message.role === "system"
            ? "System"
            : "User"
      return `${role}:\n${message.content}`
    })
    .join("\n\n")
    .concat("\n\nAssistant:\n")
}

/** 增量对话：仅发送新消息，历史由主进程 Ollama 会话维护。 */
function resolveStreamInput(messages: ChatMessage[]): {
  prompt: string
  primeMessages?: ChatSyncMessage[]
} {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "user") {
    return { prompt: formatPrompt(messages) }
  }
  if (syncedMessageCount === 0) {
    const history = messages.slice(0, -1).slice(-CHAT_PRIME_MESSAGE_LIMIT)
    return {
      prompt: last.content,
      primeMessages:
        history.length > 0
          ? history.map((m) => ({
              role: m.role,
              content: m.content,
            }))
          : undefined,
    }
  }
  return { prompt: last.content }
}

export function subscribeLoadingState(
  listener: (state: LoadingState) => void
): () => void {
  loadingListeners.add(listener)
  listener({ ...loadingState })
  return () => loadingListeners.delete(listener)
}

export function getLoadingState(): LoadingState {
  return { ...loadingState }
}

export async function getModelList(): Promise<LlmModel[]> {
  return listLocalLlmModels()
}

export async function loadModel(
  modelId: string,
  onProgress?: (progress: ModelProgress) => void,
  options?: { temperature?: number; topK?: number; systemPrompt?: string }
): Promise<ChatLoadResult | undefined> {
  if (!isElectronLlmAvailable()) return undefined
  if (currentModel === modelId) return undefined

  const progress = { progress: 0, text: "正在连接 Ollama 模型…" }
  loadingState = {
    isLoading: true,
    loadingModelId: modelId,
    progress,
  }
  notifyLoadingState()
  onProgress?.(progress)

  try {
    const settings = await getRuntimeSettings()
    const isRemote = settings.llmProvider.kind === "openai-compatible"
    const fileInfo = isRemote
      ? { ok: true as const, filePath: modelId }
      : await getChatModelFileInfo(modelId)
    if (!fileInfo.ok || !fileInfo.filePath) {
      throw new Error(
        !isRemote && "reason" in fileInfo
          ? fileInfo.reason ?? "模型文件不可用"
          : "模型不可用"
      )
    }
    try {
      if (!isRemote) {
        await unloadEmbeddingModelInMain().catch(() => {})
      }
      const loadInfo = await loadChatModelInMain({
        modelPath: fileInfo.filePath,
        preferLowPower: settings.preferLowPower,
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature ?? 0.7,
        topK: options?.topK ?? 10,
      })
      currentModel = modelId
      syncedMessageCount = 0
      return loadInfo
    } catch (error) {
      throw new Error(formatLlmLoadError(error, modelId))
    }
  } finally {
    loadingState = {
      isLoading: false,
      loadingModelId: null,
      progress: null,
    }
    notifyLoadingState()
  }
}

export function isModelLoaded(): boolean {
  return currentModel !== null
}

export function getCurrentModel(): string | null {
  return currentModel
}

export function touchLastUsed(): void {
  lastUsedTime = Date.now()
}

export function shouldKeepHot(): boolean {
  return lastUsedTime > 0 && Date.now() - lastUsedTime < HOT_CACHE_THRESHOLD_MS
}

async function ensureChatModelLoaded(): Promise<void> {
  if (currentModel) return
  const settings = await getRuntimeSettings()
  if (settings.llmProvider.kind === "openai-compatible") {
    const model = settings.llmProvider.model.trim()
    if (!settings.llmProvider.apiKey.trim()) {
      throw new Error("请先在「AI 连接」中配置 API Key 与模型名")
    }
    if (!model) {
      throw new Error("请先在「AI 连接」中配置对话模型名称")
    }
    await loadModel(model)
    return
  }
  if (!settings.llmModel) {
    throw new Error(
      "未选择本地 Ollama 对话模型，请在「AI 连接」切换为 Ollama 并在模型页下载。"
    )
  }
  await loadModel(settings.llmModel)
}

async function chatViaGatewayMessages(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  await resetChatHistoryFromMain()
  const history = messages.slice(0, -1).slice(-CHAT_PRIME_MESSAGE_LIMIT)
  if (history.length > 0) {
    await primeChatHistoryFromMain(
      history.map((m) => ({ role: m.role, content: m.content }))
    )
  }
  const last = messages[messages.length - 1]
  const input = last?.role === "user" ? last.content : formatPrompt(messages)
  const content = await chatPromptFromMain(input, {
    temperature: options?.temperature,
    topK: 10,
    maxTokens: options?.maxTokens,
  })
  syncedMessageCount = messages.length
  return content
}

export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    onChunk?: (content: string) => void
  }
): Promise<string> {
  await ensureChatModelLoaded()
  touchLastUsed()
  const settings = await getRuntimeSettings()
  const content =
    settings.llmProvider.kind === "openai-compatible"
      ? await chatViaGatewayMessages(messages, options)
      : await chatPromptFromMain(formatPrompt(messages), {
          temperature: options?.temperature,
          topK: 10,
          maxTokens: options?.maxTokens,
        })
  options?.onChunk?.(content)
  return content
}

export type ChatStreamUpdate = {
  thinking: string
  content: string
}

export async function* streamChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    useFunctions?: boolean
    onChunk?: (content: string) => void
    onStream?: (update: ChatStreamUpdate) => void
  }
): AsyncGenerator<ChatStreamUpdate & { done: boolean }> {
  await ensureChatModelLoaded()
  touchLastUsed()

  const { prompt, primeMessages } = resolveStreamInput(messages)

  const requestId = crypto.randomUUID()
  let thinkingAccum = ""
  let contentAccum = ""
  let streamError: Error | null = null

  const applyChunk = (segment: "thought" | "answer", delta: string) => {
    if (segment === "thought") thinkingAccum += delta
    else contentAccum += delta
    const display = mergeStreamThinking(thinkingAccum, contentAccum)
    const update = { thinking: display.thinking, content: display.visible }
    options?.onStream?.(update)
    options?.onChunk?.(display.visible)
    return update
  }

  const unsubscribe = onChatStreamFromMain((event) => {
    if (event.requestId !== requestId) return
    if (event.type === "chunk" && event.delta) {
      applyChunk(event.segment === "thought" ? "thought" : "answer", event.delta)
    } else if (event.type === "error") {
      streamError = new Error(event.error ?? "对话流式输出失败")
    }
  })

  try {
    await chatPromptStreamFromMain({
      requestId,
      input: prompt,
      primeMessages,
      temperature: options?.temperature,
      topK: 10,
      maxTokens: options?.maxTokens,
      useFunctions: options?.useFunctions,
    })

    if (streamError) throw streamError

    syncedMessageCount = messages.length
    const finalDisplay = mergeStreamThinking(thinkingAccum, contentAccum)
    const finalUpdate = {
      thinking: finalDisplay.thinking,
      content: finalDisplay.visible,
      done: true as const,
    }
    yield finalUpdate
  } finally {
    unsubscribe()
  }
}

export async function resetChat(): Promise<void> {
  if (!isElectronLlmAvailable()) return
  await resetChatHistoryFromMain()
  syncedMessageCount = 0
}

export async function unloadModel(): Promise<void> {
  if (!currentModel) return
  await unloadChatModelInMain()
  currentModel = null
  syncedMessageCount = 0
  loadingState = {
    isLoading: false,
    loadingModelId: null,
    progress: null,
  }
  notifyLoadingState()
}

export function preloadModel(): void {}

let embeddingQueue: Promise<void> = Promise.resolve()

async function resolveEmbeddingCatalogItem(): Promise<ModelCatalogItem | null> {
  const settings = await getRuntimeSettings()
  const catalog = await getModelCatalog("embedding")
  if (settings.embeddingModel) {
    const chosen = catalog.find(
      (item) => item.fileName === settings.embeddingModel && item.installed
    )
    if (chosen) return chosen
  }
  const metrics = await getModelRecommendations()
  return (
    catalog.find(
      (item) => item.id === metrics.recommendedEmbeddingId && item.installed
    ) ?? null
  )
}

async function withEmbeddingModel<T>(fn: () => Promise<T>): Promise<T | null> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const prev = embeddingQueue
  embeddingQueue = prev.then(() => gate)
  await prev

  const item = await resolveEmbeddingCatalogItem()
  if (!item) {
    release()
    return null
  }

  const settings = await getRuntimeSettings()
  const chatFileToRestore = currentModel

  try {
    await loadEmbeddingModelInMain(item.id, settings.preferLowPower)
    return await fn()
  } catch (error) {
    console.warn("[embedding] Failed to load model:", error)
    return null
  } finally {
    await unloadEmbeddingModelInMain().catch(() => {})
    if (chatFileToRestore) {
      const fileInfo = await getChatModelFileInfo(chatFileToRestore)
      if (fileInfo.ok && fileInfo.filePath) {
        await loadChatModelInMain({
          modelPath: fileInfo.filePath,
          preferLowPower: settings.preferLowPower,
          temperature: 0.7,
          topK: 10,
        }).catch((error) =>
          console.warn("[chat] Failed to restore model after embedding:", error)
        )
      }
    }
    release()
  }
}

export async function loadEmbeddingByFileName(
  fileName: string,
  modelId: string
): Promise<void> {
  const { startEmbeddingModel } = await import("~/services/model-runtime")
  const item = (await getModelCatalog("embedding")).find((m) => m.id === modelId)
  if (item) {
    await startEmbeddingModel(item)
    return
  }
  const settings = await getRuntimeSettings()
  const { saveRuntimeSettings } = await import("~/services/settings")
  await saveRuntimeSettings({ ...settings, embeddingModel: fileName })
}

export async function getEmbeddings(_texts: string): Promise<number[]>
export async function getEmbeddings(_texts: string[]): Promise<number[][]>
export async function getEmbeddings(
  _texts: string[] | string
): Promise<number[][] | number[]> {
  const empty = Array.isArray(_texts) ? ([] as number[][]) : ([] as number[])
  const result = await withEmbeddingModel(async () => {
    if (Array.isArray(_texts)) {
      return getEmbeddingsFromMain(_texts)
    }
    return getEmbeddingsFromMain(_texts)
  })
  if (result == null) {
    console.warn(
      "[embedding] No embedding model configured; vector search is disabled."
    )
    return empty
  }
  return result
}
