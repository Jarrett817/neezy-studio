import {
  getChatModelFileInfo,
  getEmbeddingsFromMain,
  getModelCatalog,
  getModelRecommendations,
  listLlmModels as listLocalLlmModels,
  loadEmbeddingModel as loadEmbeddingModelInMain,
  unloadEmbeddingModel as unloadEmbeddingModelInMain,
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

type ElectronAi = {
  create: (options: {
    modelAlias: string
    systemPrompt?: string
    initialPrompts?: unknown[]
    topK?: number
    temperature?: number
    requestUUID?: string
  }) => Promise<void>
  destroy: () => Promise<void>
  prompt: (
    input: string,
    options?: {
      timeout?: number
      requestUUID?: string
      responseJSONSchema?: object
    }
  ) => Promise<string>
  promptStreaming: (
    input: string,
    options?: {
      timeout?: number
      requestUUID?: string
      responseJSONSchema?: object
    }
  ) => Promise<AsyncIterableIterator<string>>
  abortRequest: (requestUUID: string) => void
}

declare global {
  interface Window {
    electronAi?: ElectronAi
  }
}

type LoadingState = {
  isLoading: boolean
  loadingModelId: string | null
  progress: ModelProgress | null
}

let currentModel: string | null = null
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
  if (/Failed to load model/i.test(nested)) {
    return [
      `无法加载 ${fileName}。`,
      "常见原因：GGUF 未下载完整、显存/内存不足，或量化格式与运行时不兼容。",
      "可关闭其它占用显存的应用，或先试用较小的模型验证环境。",
    ].join(" ")
  }
  return nested || "模型加载失败"
}

/** 渲染进程且 @electron/llm 预加载已注入 */
export function isElectronLlmAvailable(): boolean {
  return typeof window !== "undefined" && window.electronAi != null
}

function getElectronAi(): ElectronAi {
  if (!isElectronLlmAvailable()) {
    throw new Error(
      "@electron/llm 未就绪。请用 bun run electron:dev 启动，并确保主进程在开窗前已调用 loadElectronLlm。"
    )
  }
  return window.electronAi!
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
): Promise<void> {
  if (!isElectronLlmAvailable()) return
  if (currentModel === modelId) return

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
    if (!fileInfo.ok) {
      throw new Error(fileInfo.reason ?? "模型文件不可用")
    }
    try {
      await unloadEmbeddingModelInMain().catch(() => {})
      await getElectronAi().create({
        modelAlias: modelId,
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature ?? 0.7,
        topK: options?.topK ?? 10,
      })
      currentModel = modelId
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
  const content = await getElectronAi().prompt(formatPrompt(messages), {
    timeout: 120000,
  })
  options?.onChunk?.(content)
  return content
}

export async function* streamChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    onChunk?: (content: string) => void
  }
): AsyncGenerator<{ content: string; done: boolean }> {
  if (!currentModel) {
    throw new Error(
      "No local GGUF model is loaded. Put a .gguf file in the app models folder and load it first."
    )
  }
  touchLastUsed()

  const stream = await getElectronAi().promptStreaming(formatPrompt(messages), {
    timeout: 120000,
  })
  let accumulatedContent = ""

  for await (const chunk of stream) {
    accumulatedContent += chunk
    options?.onChunk?.(accumulatedContent)
    yield { content: accumulatedContent, done: false }
  }

  yield { content: accumulatedContent, done: true }
}

export async function resetChat(): Promise<void> {}

export async function unloadModel(): Promise<void> {
  if (!currentModel) return
  await getElectronAi().destroy()
  currentModel = null
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

  try {
    await loadEmbeddingModelInMain(item.id)
    return await fn()
  } catch (error) {
    console.warn("[embedding] Failed to load model:", error)
    return null
  } finally {
    await unloadEmbeddingModelInMain().catch(() => {})
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
