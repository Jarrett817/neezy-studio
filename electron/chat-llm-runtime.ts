import type {
  ChatHistoryItem,
  LlamaChatSession,
  LlamaContext,
  LlamaModel,
} from "node-llama-cpp"

import {
  describeLayerSplit,
  isInsufficientMemoryError,
  resolveChatLoadPolicy,
  type LlamaLoadPolicy,
} from "./llm-load-policy"
import { acquireLlama, disposeLlamaInstance, getLlamaModule } from "./node-llama-runtime"
import type {
  ChatLoadResult,
  ChatPromptOptions,
  ChatStreamDelta,
  ChatStreamSegment,
} from "./types"

let chatModel: LlamaModel | null = null
let chatContext: LlamaContext | null = null
let chatSession: LlamaChatSession | null = null
let loadedModelPath: string | null = null
let lastLoadInfo: ChatLoadResult | null = null

async function disposeChatSession(): Promise<void> {
  chatSession = null
  if (chatContext) {
    await chatContext.dispose()
    chatContext = null
  }
  if (chatModel) {
    await chatModel.dispose()
    chatModel = null
  }
  loadedModelPath = null
}

async function loadChatModelWithPolicy(
  modelPath: string,
  options: {
    preferLowPower?: boolean
    systemPrompt?: string
    temperature?: number
    topK?: number
  },
  policy: LlamaLoadPolicy
): Promise<ChatLoadResult> {
  await disposeChatSession()

  const llama = await acquireLlama(Boolean(options.preferLowPower))
  const { LlamaChatSession } = await getLlamaModule()

  chatModel = await llama.loadModel({
    modelPath,
    gpuLayers: policy.gpuLayers,
  })
  chatContext = await chatModel.createContext({
    contextSize: policy.contextSize,
  })
  chatSession = new LlamaChatSession({
    contextSequence: chatContext.getSequence(),
    systemPrompt: options.systemPrompt,
  })
  loadedModelPath = modelPath

  const split = describeLayerSplit(chatModel)
  lastLoadInfo = {
    modelPath,
    contextSize: policy.contextSize,
    preferLowPower: Boolean(options.preferLowPower),
    requestedLayerSplit: policy.layerSplit,
    ...split,
  }
  return lastLoadInfo
}

export async function loadChatModel(
  modelPath: string,
  options: {
    preferLowPower?: boolean
    systemPrompt?: string
    temperature?: number
    topK?: number
  } = {}
): Promise<ChatLoadResult> {
  const preferLowPower = Boolean(options.preferLowPower)
  const primary = resolveChatLoadPolicy(preferLowPower)

  try {
    return await loadChatModelWithPolicy(modelPath, options, primary)
  } catch (error) {
    if (!preferLowPower && isInsufficientMemoryError(error)) {
      console.warn("[chat-llm] Auto GPU layers failed, falling back to CPU:", error)
      await disposeChatSession()
      await disposeLlamaInstance()
      const fallback = resolveChatLoadPolicy(true)
      const result = await loadChatModelWithPolicy(
        modelPath,
        { ...options, preferLowPower: true },
        fallback
      )
      return { ...result, fallbackCpu: true }
    }
    throw error
  }
}

export async function unloadChatModel(): Promise<void> {
  await disposeChatSession()
  lastLoadInfo = null
}

export function resetChatHistory(): void {
  chatSession?.resetChatHistory()
}

function assertChatReady(): void {
  if (!chatSession) {
    throw new Error("对话模型未启动，请先在模型页启动对话模型。")
  }
}

function promptOptions(options: ChatPromptOptions = {}) {
  return {
    temperature: options.temperature ?? 0.7,
    topK: options.topK ?? 10,
    maxTokens: options.maxTokens ?? 2048,
  }
}

export async function chatPrompt(
  input: string,
  options: ChatPromptOptions = {}
): Promise<string> {
  assertChatReady()
  return chatSession!.prompt(input, promptOptions(options))
}

function chunkSegment(chunk: {
  type?: string
  segmentType?: string
}): ChatStreamSegment {
  return chunk.type === "segment" && chunk.segmentType === "thought"
    ? "thought"
    : "answer"
}

/** 流式增量；Qwen3 思考在 segmentType=thought，不含 XML 标签。 */
export async function* chatPromptStream(
  input: string,
  options: ChatPromptOptions = {}
): AsyncGenerator<ChatStreamDelta, void, unknown> {
  assertChatReady()
  const pending: ChatStreamDelta[] = []
  let notify: (() => void) | null = null
  let failed: unknown = null
  let finished = false

  const wake = () => {
    if (notify) {
      const n = notify
      notify = null
      n()
    }
  }

  await chatSession!.preloadPrompt(input).catch(() => {})

  const run = chatSession!
    .prompt(input, {
      ...promptOptions(options),
      onResponseChunk(chunk) {
        if (!chunk.text) return
        pending.push({ segment: chunkSegment(chunk), delta: chunk.text })
        wake()
      },
    })
    .then(() => {
      finished = true
      wake()
    })
    .catch((err) => {
      failed = err
      finished = true
      wake()
    })

  while (!finished || pending.length > 0) {
    while (pending.length > 0) {
      yield pending.shift()!
    }
    if (failed) {
      await run
      throw failed
    }
    if (finished) break
    await new Promise<void>((resolve) => {
      notify = resolve
    })
  }
  await run
}

export function primeChatHistory(items: ChatHistoryItem[]): void {
  assertChatReady()
  chatSession!.setChatHistory(items)
}

export function messagesToChatHistory(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): ChatHistoryItem[] {
  const items: ChatHistoryItem[] = []
  for (const message of messages) {
    if (message.role === "system") {
      items.push({ type: "system", text: message.content })
    } else if (message.role === "user") {
      items.push({ type: "user", text: message.content })
    } else {
      items.push({ type: "model", response: [message.content] })
    }
  }
  return items
}

export function getChatModelStatus() {
  return {
    loaded: Boolean(chatSession),
    modelPath: loadedModelPath,
    loadInfo: lastLoadInfo,
  }
}
