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
const loadingListeners = new Set<(state: LoadingState) => void>()

function formatLlmLoadError(error: unknown, fileName: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "模型加载失败"
  const nested = raw.replace(/^Error:\s*/i, "").trim()
  if (/Failed to load model|ErrorOutOfDeviceMemory|failed to allocate/i.test(nested)) {
    return [
      `无法加载 ${fileName}。`,
      "常见原因：显存不足（独显仅 2GB 时请开启「优先低功耗」）、GGUF 未下载完整，或其它程序占用 GPU。",
      "可在设置中开启低功耗（CPU + 较小上下文），或关闭 Ollama 等占显存程序后重试。",
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

/** 用 LlamaChatSession 增量对话，避免每轮重算整段 history（对齐 Ollama 式 TTFT）。 */
function resolveStreamInput(messages: ChatMessage[]): {
  prompt: string
  primeMessages?: ChatSyncMessage[]
} {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "user") {
    return { prompt: formatPrompt(messages) }
  }
  if (syncedMessageCount === 0) {
    const history = messages.slice(0, -1)
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

  const progress = { progress: 0, text: "Loading local GGUF model..." }
  loadingState = {
    isLoading: true,
    loadingModelId: modelId,
    progress,
  }
  notifyLoadingState()
  onProgress?.(progress)

  try {
    const fileInfo = await getChatModelFileInfo(modelId)
    if (!fileInfo.ok || !fileInfo.filePath) {
      throw new Error(fileInfo.reason ?? "模型文件不可用")
    }
    const settings = await getRuntimeSettings()
    try {
      await unloadEmbeddingModelInMain().catch(() => {})
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

export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    onChunk?: (content: string) => void
  }
): Promise<string> {
  if (!currentModel) {
    throw new Error(
      "No local GGUF model is loaded. Put a .gguf file in the app models folder and load it first."
    )
  }
  touchLastUsed()
  const content = await chatPromptFromMain(formatPrompt(messages), {
    temperature: options?.temperature,
    topK: 10,
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
  if (!currentModel) {
    throw new Error(
      "No local GGUF model is loaded. Put a .gguf file in the app models folder and load it first."
    )
  }
  touchLastUsed()

  const { prompt, primeMessages } = resolveStreamInput(messages)

  const requestId = crypto.randomUUID()
  let thinkingAccum = ""
  let contentAccum = ""
  const pending: ChatStreamUpdate[] = []
  let streamError: Error | null = null
  let streamDone = false
  let wake: (() => void) | null = null

  const pushStreamUpdate = () => {
    const display = mergeStreamThinking(thinkingAccum, contentAccum)
    const update = { thinking: display.thinking, content: display.visible }
    if (pending.length > 0) pending[0] = update
    else pending.push(update)
    wake?.()
  }

  const unsubscribe = onChatStreamFromMain((event) => {
    if (event.requestId !== requestId) return
    if (event.type === "start") {
      options?.onStream?.({ thinking: thinkingAccum, content: contentAccum })
      return
    }
    if (event.type === "chunk" && event.delta) {
      if (event.segment === "thought") {
        thinkingAccum += event.delta
      } else {
        contentAccum += event.delta
      }
      const display = mergeStreamThinking(thinkingAccum, contentAccum)
      options?.onStream?.({
        thinking: display.thinking,
        content: display.visible,
      })
      options?.onChunk?.(display.visible)
      pushStreamUpdate()
    } else if (event.type === "error") {
      streamError = new Error(event.error ?? "对话流式输出失败")
      streamDone = true
      wake?.()
    } else if (event.type === "done") {
      streamDone = true
      wake?.()
    }
  })

  try {
    const invokePromise = chatPromptStreamFromMain({
      requestId,
      input: prompt,
      primeMessages,
      temperature: options?.temperature,
      topK: 10,
      maxTokens: options?.maxTokens,
      useFunctions: options?.useFunctions,
    })

    while (!streamDone || pending.length > 0) {
      while (pending.length > 0) {
        const update = pending.shift()!
        yield { ...update, done: false }
      }
      if (streamDone) break
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }

    await invokePromise
    if (streamError) throw streamError

    syncedMessageCount = messages.length
    const finalDisplay = mergeStreamThinking(thinkingAccum, contentAccum)
    yield {
      thinking: finalDisplay.thinking,
      content: finalDisplay.visible,
      done: true,
    }
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
