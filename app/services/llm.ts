import { listLlmModels as listLocalLlmModels } from "~/services/electron-client"

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
  prompt: (input: string, options?: { timeout?: number; requestUUID?: string; responseJSONSchema?: object }) => Promise<string>
  promptStreaming: (input: string, options?: { timeout?: number; requestUUID?: string; responseJSONSchema?: object }) => Promise<AsyncIterableIterator<string>>
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

function getElectronAi(): ElectronAi {
  if (typeof window === "undefined" || !window.electronAi) {
    throw new Error("@electron/llm is only available in the Electron renderer.")
  }
  return window.electronAi
}

function notifyLoadingState() {
  loadingListeners.forEach((listener) => listener({ ...loadingState }))
}

function formatPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "User"
      return `${role}:\n${message.content}`
    })
    .join("\n\n")
    .concat("\n\nAssistant:\n")
}

export function subscribeLoadingState(listener: (state: LoadingState) => void): () => void {
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
    await getElectronAi().create({
      modelAlias: modelId,
      systemPrompt: options?.systemPrompt,
      temperature: options?.temperature ?? 0.7,
      topK: options?.topK ?? 10,
    })
    currentModel = modelId
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
    throw new Error("No local GGUF model is loaded. Put a .gguf file in the app models folder and load it first.")
  }
  touchLastUsed()
  const content = await getElectronAi().prompt(formatPrompt(messages), { timeout: 120000 })
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
    throw new Error("No local GGUF model is loaded. Put a .gguf file in the app models folder and load it first.")
  }
  touchLastUsed()

  const stream = await getElectronAi().promptStreaming(formatPrompt(messages), { timeout: 120000 })
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

export async function getEmbeddings(_texts: string): Promise<number[]>
export async function getEmbeddings(_texts: string[]): Promise<number[][]>
export async function getEmbeddings(_texts: string[] | string): Promise<number[][] | number[]> {
  console.warn("@electron/llm does not provide embeddings; semantic vector search is disabled.")
  return []
}
