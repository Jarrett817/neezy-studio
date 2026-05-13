// WebLLM 服务 - 浏览器端大模型推理

import {
  CreateMLCEngine,
  CreateWebWorkerMLCEngine,
  type MLCEngine,
  type InitProgressCallback,
  type MLCEngineInterface,
} from "@mlc-ai/web-llm"

export type WebLLMModel = {
  id: string
  name: string
  description?: string
}

export type ModelProgress = {
  progress?: number
  text?: string
  timeElapsed?: number
}

type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

let engine: MLCEngineInterface | null = null
let currentModel: string | null = null
let useWorker = false

// Embedding 模型（独立于 chat 模型）
let embeddingEngine: MLCEngineInterface | null = null
let embeddingModel: string | null = null

const EMBEDDING_MODEL_ID = "snowflake-arctic-embed-m-q0f32-MLC-b4"

// 加载状态管理（用于跨组件同步状态）
type LoadingState = {
  isLoading: boolean
  loadingModelId: string | null
  progress: ModelProgress | null
}
let loadingState: LoadingState = {
  isLoading: false,
  loadingModelId: null,
  progress: null,
}
type LoadingStateListener = (state: LoadingState) => void
const loadingListeners = new Set<LoadingStateListener>()

function notifyLoadingState() {
  loadingListeners.forEach((listener) => listener({ ...loadingState }))
}

export function subscribeLoadingState(listener: LoadingStateListener): () => void {
  loadingListeners.add(listener)
  listener({ ...loadingState })
  return () => loadingListeners.delete(listener)
}

export function getLoadingState(): LoadingState {
  return { ...loadingState }
}

// 获取可用模型列表
export function getModelList(): WebLLMModel[] {
  return [
    { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama-3.2-3B-Instruct (Q4)", description: "轻量级开源模型" },
    { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama-3.1-8B-Instruct (Q4)", description: "中等规模模型" },
    { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi-3.5-mini-Instruct (Q4)", description: "微软小模型" },
    { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", name: "Qwen2.5-3B-Instruct (Q4)", description: "阿里轻量模型" },
    { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", name: "Qwen2.5-7B-Instruct (Q4)", description: "阿里中量模型" },
    { id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC", name: "Mistral-7B-Instruct (Q4)", description: "欧洲开源模型" },
    { id: "gemma-2-2b-it-q4f16_1-MLC", name: "Gemma-2-2B-Instruct (Q4)", description: "Google 小模型" },
  ]
}

// 进度回调类型
type ProgressCallback = (progress: ModelProgress) => void


// 加载模型
export async function loadModel(
  modelId: string,
  onProgress?: ProgressCallback,
  options?: { useWorker?: boolean }
): Promise<MLCEngineInterface> {
  // 如果正在加载其他模型，不允许重复加载
  if (loadingState.isLoading && loadingState.loadingModelId !== modelId) {
    throw new Error(`正在加载 ${loadingState.loadingModelId}，请等待完成`)
  }

  // 如果已加载相同模型，直接返回
  if (engine && currentModel === modelId) {
    console.log("[WebLLM] Model already loaded:", modelId)
    return engine
  }

  // 标记开始加载
  loadingState = {
    isLoading: true,
    loadingModelId: modelId,
    progress: { progress: 0, text: "初始化中..." },
  }
  notifyLoadingState()

  const initProgressCallback: InitProgressCallback = (progress) => {
    console.log("[WebLLM] Loading progress:", progress)
    const newProgress = {
      progress: progress.progress ?? 0,
      text: progress.text ?? "",
      timeElapsed: progress.timeElapsed ?? 0,
    }
    loadingState.progress = newProgress
    notifyLoadingState()
    onProgress?.(newProgress)
  }

  // 卸载旧模型
  if (engine) {
    console.log("[WebLLM] Unloading previous model...")
    await engine.unload()
    engine = null
    currentModel = null
  }

  console.log("[WebLLM] Loading model:", modelId)
  useWorker = options?.useWorker ?? false

  if (useWorker) {
    console.log("[WebLLM] Using Web Worker for inference")
    engine = await CreateWebWorkerMLCEngine(
      new Worker(new URL("./webllm-worker.ts", import.meta.url), { type: "module" }),
      modelId,
      { initProgressCallback }
    )
  } else {
    // 普通模式，直接加载（使用默认 Cache API 缓存）
    engine = await CreateMLCEngine(modelId, {
      initProgressCallback,
    })
  }

  currentModel = modelId
  console.log("[WebLLM] Model loaded successfully:", modelId)

  // 标记加载完成
  loadingState = {
    isLoading: false,
    loadingModelId: null,
    progress: null,
  }
  notifyLoadingState()

  return engine
}

// 检查模型是否已加载
export function isModelLoaded(): boolean {
  return engine !== null
}

// 获取当前模型
export function getCurrentModel(): string | null {
  return currentModel
}

// 对话（非流式）
export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    onChunk?: (content: string) => void
  }
): Promise<string> {
  if (!engine) {
    throw new Error("模型未加载，请先调用 loadModel()")
  }

  const response = await engine.chat.completions.create({
    messages,
    stream: false,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
  })

  const content = response.choices[0]?.message?.content ?? ""
  return content
}

// 流式对话
export async function* streamChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    onChunk?: (content: string) => void
  }
): AsyncGenerator<{ content: string; done: boolean }> {
  if (!engine) {
    throw new Error("模型未加载，请先调用 loadModel()")
  }

  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
    stream_options: { include_usage: false },
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
  })

  let accumulatedContent = ""

  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content ?? ""
    if (delta) {
      accumulatedContent += delta
      options?.onChunk?.(accumulatedContent)
      yield { content: accumulatedContent, done: false }
    }
  }

  yield { content: accumulatedContent, done: true }
}

// 获取 GPU 信息
export async function getGPUInfo(): Promise<{
  gpuVendor: string
  maxStorageBufferBindingSize: number
  webgpuSupported: boolean
} | null> {
  if (!engine) return null

  try {
    const [gpuVendor, maxSize] = await Promise.all([
      engine.getGPUVendor(),
      engine.getMaxStorageBufferBindingSize(),
    ])
    return {
      gpuVendor,
      maxStorageBufferBindingSize: maxSize,
      webgpuSupported: true,
    }
  } catch (e) {
    console.error("[WebLLM] Failed to get GPU info:", e)
    return null
  }
}

// 重置聊天历史
export async function resetChat(keepStats = false): Promise<void> {
  if (engine) {
    await engine.resetChat(keepStats)
  }
}

// 卸载模型
export async function unloadModel(): Promise<void> {
  if (engine) {
    await engine.unload()
    engine = null
    currentModel = null
    console.log("[WebLLM] Model unloaded")
  }
  // 重置加载状态
  loadingState = {
    isLoading: false,
    loadingModelId: null,
    progress: null,
  }
  notifyLoadingState()
}

// ==================== Embedding 支持 ====================

export async function loadEmbeddingModel(
  onProgress?: ProgressCallback
): Promise<MLCEngineInterface> {
  if (embeddingEngine && embeddingModel === EMBEDDING_MODEL_ID) {
    console.log("[WebLLM] Embedding model already loaded")
    return embeddingEngine
  }

  if (embeddingEngine) {
    await embeddingEngine.unload()
    embeddingEngine = null
  }

  console.log("[WebLLM] Loading embedding model:", EMBEDDING_MODEL_ID)

  const initProgressCallback: InitProgressCallback = (progress) => {
    console.log("[WebLLM Embedding] Loading progress:", progress)
    onProgress?.({
      progress: progress.progress ?? 0,
      text: progress.text ?? "",
      timeElapsed: progress.timeElapsed ?? 0,
    })
  }

  embeddingEngine = await CreateMLCEngine(EMBEDDING_MODEL_ID, {
    initProgressCallback,
  })
  embeddingModel = EMBEDDING_MODEL_ID
  console.log("[WebLLM] Embedding model loaded successfully")

  return embeddingEngine
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!embeddingEngine) {
    await loadEmbeddingModel()
  }

  const response = await embeddingEngine!.embeddings.create({
    input: texts,
    model: EMBEDDING_MODEL_ID,
  })

  return response.data.map((item) => item.embedding)
}

export async function getEmbedding(text: string): Promise<number[]> {
  const results = await getEmbeddings([text])
  return results[0] ?? []
}