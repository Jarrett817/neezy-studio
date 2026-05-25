import type {

  ChatHistoryItem,

  Llama,

  LlamaChat,

  LlamaContext,

  LlamaModel,

} from "node-llama-cpp"



import {

  describeLayerSplit,

  isInsufficientMemoryError,

  resolveChatLoadPolicy,

} from "./llm-load-policy"

import { resolveChatRuntimeConfig } from "./llm-insights-policy"

import { buildChatSessionFunctions } from "./agent-tools-runtime"

import { acquireLlama, disposeLlamaInstance, getLlamaModule } from "./node-llama-runtime"

import type {

  ChatLoadResult,

  ChatPromptOptions,

  ChatStreamDelta,

} from "./types"



let chatModel: LlamaModel | null = null

let chatContext: LlamaContext | null = null

let chat: LlamaChat | null = null

let chatHistory: ChatHistoryItem[] = []

let systemPromptText: string | undefined

let loadedModelPath: string | null = null

let lastLoadInfo: ChatLoadResult | null = null



async function disposeChatSession(): Promise<void> {

  if (chat) {

    chat.dispose()

    chat = null

  }

  chatHistory = []

  systemPromptText = undefined

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



function historyWithSystem(): ChatHistoryItem[] {

  if (!systemPromptText) return [...chatHistory]

  const hasSystem = chatHistory.some((item) => item.type === "system")

  if (hasSystem) return [...chatHistory]

  return [{ type: "system", text: systemPromptText }, ...chatHistory]

}



async function loadChatModelWithPolicy(

  modelPath: string,

  options: {

    preferLowPower?: boolean

    systemPrompt?: string

    temperature?: number

    topK?: number

  },

  runtime: Awaited<ReturnType<typeof resolveChatRuntimeConfig>>,

  llama: Llama

): Promise<ChatLoadResult> {

  await disposeChatSession()



  const { LlamaChat, resolveChatWrapper } = await getLlamaModule()



  chatModel = await llama.loadModel({
    modelPath,
    gpuLayers: runtime.gpuLayers,
    useMmap: runtime.useMmap,
    defaultContextFlashAttention: true
  })

  chatContext = await chatModel.createContext({

    contextSize: runtime.contextSize,

    batchSize: runtime.batchSize,

    flashAttention: runtime.flashAttention,

    swaFullCache: runtime.swaFullCache,

  })

  chat = new LlamaChat({

    contextSequence: chatContext.getSequence(),

    chatWrapper: resolveChatWrapper(chatModel),

  })

  systemPromptText = options.systemPrompt

  chatHistory = options.systemPrompt

    ? [{ type: "system", text: options.systemPrompt }]

    : []

  loadedModelPath = modelPath



  const split = describeLayerSplit(chatModel)

  lastLoadInfo = {

    modelPath,

    contextSize: runtime.contextSize,

    preferLowPower: Boolean(options.preferLowPower),

    requestedLayerSplit: runtime.layerSplit,

    flashAttention: runtime.flashAttention,

    compatibilityScore: runtime.compatibilityScore,

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

  const llama = await acquireLlama(preferLowPower)

  const primary = await resolveChatRuntimeConfig(modelPath, preferLowPower, llama)



  try {

    return await loadChatModelWithPolicy(modelPath, options, primary, llama)

  } catch (error) {

    if (!preferLowPower && isInsufficientMemoryError(error)) {

      console.warn("[chat-llm] Auto GPU layers failed, falling back to CPU:", error)

      await disposeChatSession()

      await disposeLlamaInstance()

      const fallback = resolveChatLoadPolicy(true, modelPath)

      const llamaCpu = await acquireLlama(true)

      const result = await loadChatModelWithPolicy(

        modelPath,

        { ...options, preferLowPower: true },

        { ...fallback, flashAttention: false, swaFullCache: false, useMmap: false },

        llamaCpu

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

  chatHistory = systemPromptText ? [{ type: "system", text: systemPromptText }] : []

}



function assertChatReady(): void {

  if (!chat) {

    throw new Error("对话模型未启动，请先在模型页启动对话模型。")

  }

}



async function resolveGenerateOptions(options: ChatPromptOptions = {}) {

  const base = {

    temperature: options.temperature ?? 0.7,

    topK: options.topK ?? 10,

    maxTokens: options.maxTokens ?? 2048,

    contextShift: { strategy: "eraseFirstResponseAndKeepFirstSystem" as const },

  }

  if (options.useFunctions === false) return base

  const functions = await buildChatSessionFunctions()

  return { ...base, functions }

}



export async function chatPrompt(

  input: string,

  options: ChatPromptOptions = {}

): Promise<string> {

  assertChatReady()

  const history = [...historyWithSystem(), { type: "user" as const, text: input }]

  const result = await chat!.generateResponse(history, await resolveGenerateOptions(options))

  chatHistory = result.lastEvaluation.cleanHistory

  return result.response

}



/** 流式：onTextChunk 出正文；Qwen3 等思考的 segment 走 onResponseChunk。 */

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



  const genOpts = {

    ...(await resolveGenerateOptions(options)),

    onTextChunk(text: string) {

      if (!text) return

      pending.push({ segment: "answer", delta: text })

      wake()

    },

    onResponseChunk(chunk: {

      type?: string

      segmentType?: string

      text?: string

    }) {

      if (chunk.type !== "segment" || chunk.segmentType !== "thought" || !chunk.text) {

        return

      }

      pending.push({ segment: "thought", delta: chunk.text })

      wake()

    },

  }



  const history = [...historyWithSystem(), { type: "user" as const, text: input }]

  const run = chat!

    .generateResponse(history, genOpts)

    .then((result) => {

      chatHistory = result.lastEvaluation.cleanHistory

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

  chatHistory = items

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

    loaded: Boolean(chat),

    modelPath: loadedModelPath,

    loadInfo: lastLoadInfo,

  }

}


