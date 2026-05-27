import type { ChatRequest, Message, Tool } from "ollama"

import type { ChatLoadResult, ChatPromptOptions, ChatStreamDelta } from "../types"
import { getOllamaClient } from "./client"
import { findCatalogEntryByName, isModelInstalled } from "./catalog"
import { ensureOllama, ensureOllamaReady } from "./lifecycle"
import { modelSupportsNativeThink } from "./thinking"
import {
  modelSupportsToolsFromShow,
  modelSupportsToolsHeuristic,
  showOllamaModel,
} from "./model-info"
import { getOllamaTools, runToolCall } from "./agent-tools"

let activeModel: string | null = null
let activeModelSupportsTools = false
const modelCapabilitiesCache = new Map<string, boolean>()
let chatMessages: Message[] = []
let lastLoadInfo: ChatLoadResult | null = null

const CHAT_KEEP_ALIVE = "30m"

async function refreshActiveModelCapabilities(modelName: string): Promise<void> {
  const cached = modelCapabilitiesCache.get(modelName)
  if (cached !== undefined) {
    activeModelSupportsTools = cached
    return
  }
  const show = await showOllamaModel(modelName)
  activeModelSupportsTools = show?.capabilities?.length
    ? modelSupportsToolsFromShow(show)
    : modelSupportsToolsHeuristic(modelName)
  modelCapabilitiesCache.set(modelName, activeModelSupportsTools)
}

export function getChatModelStatus() {
  return {
    loaded: activeModel !== null,
    modelPath: activeModel,
    loadInfo: lastLoadInfo,
  }
}

export async function loadChatModel(
  modelName: string,
  options: {
    preferLowPower?: boolean
    systemPrompt?: string
    temperature?: number
    topK?: number
  } = {}
): Promise<ChatLoadResult> {
  await ensureOllamaReady()
  const entry = findCatalogEntryByName(modelName)
  const name = entry?.fileName ?? modelName
  if (!isModelInstalled(name)) {
    throw new Error(`模型 ${name} 未安装，请先在模型页下载（ollama pull）`)
  }
  activeModel = name
  await refreshActiveModelCapabilities(name)
  chatMessages = options.systemPrompt
    ? [{ role: "system", content: options.systemPrompt }]
    : []
  lastLoadInfo = {
    modelPath: name,
    contextSize: 8192,
    preferLowPower: Boolean(options.preferLowPower),
    layerSplit: "auto",
    requestedLayerSplit: "auto",
  }
  return lastLoadInfo
}

export async function unloadChatModel(): Promise<void> {
  activeModel = null
  activeModelSupportsTools = false
  chatMessages = []
  lastLoadInfo = null
}

export function resetChatHistory(): void {
  const system = chatMessages.find((m) => m.role === "system")
  chatMessages = system ? [system] : []
}

export function primeChatHistory(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): void {
  chatMessages = messages.map((m) => ({ role: m.role, content: m.content }))
}

export function messagesToChatHistory(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
) {
  return messages
}

function buildChatRequest(
  messages: Message[],
  options: ChatPromptOptions,
  stream: boolean
): ChatRequest {
  const tools: Tool[] | undefined =
    options.useFunctions === true && activeModelSupportsTools
      ? (getOllamaTools() as Tool[])
      : undefined

  const request: ChatRequest = {
    model: activeModel!,
    messages,
    stream,
    tools,
    keep_alive: CHAT_KEEP_ALIVE,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2048,
      num_ctx: 4096,
    },
  }

  if (options.enableThinking === true && modelSupportsNativeThink(activeModel)) {
    request.think = true
  }

  return request
}

/** Ollama 流式 chunk 可能是增量 token，也可能是累积全文；兼容两种格式 */
function appendStreamPiece(
  piece: string,
  accumulated: string
): { delta: string; next: string } {
  if (!piece) return { delta: "", next: accumulated }
  if (accumulated && piece.startsWith(accumulated)) {
    return { delta: piece.slice(accumulated.length), next: piece }
  }
  return { delta: piece, next: accumulated + piece }
}

function emitStreamDeltas(
  msg: Message,
  state: { thinking: string; content: string },
  onDelta: (delta: ChatStreamDelta) => void
): void {
  if (typeof msg.thinking === "string" && msg.thinking.length > 0) {
    const { delta, next } = appendStreamPiece(msg.thinking, state.thinking)
    if (delta) {
      onDelta({ segment: "thought", delta })
      state.thinking = next
    }
  }
  if (typeof msg.content === "string" && msg.content.length > 0) {
    const { delta, next } = appendStreamPiece(msg.content, state.content)
    if (delta) {
      onDelta({ segment: "answer", delta })
      state.content = next
    }
  }
}

async function chatOnce(
  messages: Message[],
  options: ChatPromptOptions,
  onDelta?: (delta: ChatStreamDelta) => void
): Promise<Message> {
  if (!activeModel) throw new Error("对话模型未选择")
  await ensureOllamaReady()

  if (!onDelta) {
    const data = await getOllamaClient().chat({
      ...buildChatRequest(messages, options, false),
      stream: false,
    })
    return data.message
  }

  const stream = await getOllamaClient().chat({
    ...buildChatRequest(messages, options, true),
    stream: true,
  })

  const state = { thinking: "", content: "" }
  let assistant: Message = { role: "assistant", content: "" }

  for await (const part of stream) {
    const msg = part.message
    if (!msg) continue
    emitStreamDeltas(msg, state, onDelta)
    assistant = {
      role: "assistant",
      content: state.content,
      ...(state.thinking ? { thinking: state.thinking } : {}),
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    }
  }

  return assistant
}

async function chatWithOptionalTools(
  userInput: string,
  options: ChatPromptOptions,
  onDelta?: (delta: ChatStreamDelta) => void
): Promise<string> {
  chatMessages.push({ role: "user", content: userInput })
  let rounds = 0
  let finalText = ""
  while (rounds < 6) {
    rounds += 1
    const assistant = await chatOnce(chatMessages, options, onDelta)
    chatMessages.push(assistant)
    finalText = assistant.content
    const calls = assistant.tool_calls
    if (!calls?.length || options.useFunctions === false) break
    for (const call of calls) {
      const fn = call.function
      const rawArgs = fn.arguments
      const args =
        typeof rawArgs === "string"
          ? (JSON.parse(rawArgs) as Record<string, unknown>)
          : rawArgs
      const result = await runToolCall(fn.name, args)
      chatMessages.push({ role: "tool", content: result })
    }
  }
  return finalText
}

export async function chatPrompt(
  input: string,
  options: ChatPromptOptions = {}
): Promise<string> {
  if (!activeModel) throw new Error("对话模型未启动")
  return chatWithOptionalTools(input, { ...options, useFunctions: false })
}

/** 直接消费 ollama.js 流，经 onDelta 立刻回调（供 IPC 推送，无额外队列） */
export async function runChatPromptStream(
  input: string,
  options: ChatPromptOptions,
  onDelta: (delta: ChatStreamDelta) => void
): Promise<void> {
  if (!activeModel) throw new Error("对话模型未启动")
  await chatWithOptionalTools(input, options, onDelta)
}

/** @deprecated 使用 runChatPromptStream */
export async function* chatPromptStream(
  input: string,
  options: ChatPromptOptions = {}
): AsyncGenerator<ChatStreamDelta, void, unknown> {
  const queue: ChatStreamDelta[] = []
  let resolveWait: (() => void) | null = null
  const task = runChatPromptStream(input, options, (delta) => {
    queue.push(delta)
    resolveWait?.()
    resolveWait = null
  })

  let done = false
  let error: unknown = null
  void task
    .then(() => {
      done = true
      resolveWait?.()
    })
    .catch((e) => {
      error = e
      done = true
      resolveWait?.()
    })

  while (!done || queue.length > 0) {
    while (queue.length > 0) {
      yield queue.shift()!
    }
    if (done) break
    await new Promise<void>((resolve) => {
      resolveWait = resolve
    })
  }
  if (error) throw error
}
