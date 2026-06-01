import {
  completeSimple,
  streamSimple,
  type AssistantMessage,
  type Context,
  type Message,
  type TextContent,
  type ThinkingContent,
} from "@earendil-works/pi-ai"

import type { ChatPromptOptions, ChatStreamDelta } from "./types"
import { resolveAgentThinkingLevel, resolvePiChatModel } from "./pi-model"
import { resolveActiveChatRoute, resolvedChatUsesApi } from "./model-routing"
import { ensureOllamaReady } from "./ollama/lifecycle"
import { resolveEntryApiKey } from "./chat-model-entry"
import { getSyncedRuntimeSettings } from "./runtime-settings"

/** Playbook 单轮流式：仅 role + 文本，经 toPiUserOrAssistant 转为 pi-ai Message */
export type PiChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

let activeModelId: string | null = null

function resolvePiReasoningOption(
  userMessage?: string
): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  const model = resolvePiChatModel(userMessage)
  const level = resolveAgentThinkingLevel(model)
  return level === "off" ? undefined : level
}

/** pi-ai 的 openai-completions 路径要求非空 apiKey；Ollama 本地不校验，用占位即可 */
export const OLLAMA_PI_API_KEY = "ollama"

export function resolveRouteApiKey(userMessage?: string): string | undefined {
  const route = resolveActiveChatRoute(userMessage)
  const entry = route.entry
  const provider = getSyncedRuntimeSettings().llmProvider
  if (entry?.transport === "openai-compatible") {
    return resolveEntryApiKey(entry, provider) || undefined
  }
  const model = resolvePiChatModel(userMessage)
  if (model.provider === "ollama") return OLLAMA_PI_API_KEY
  return undefined
}

function textFromBlocks(
  blocks: (TextContent | ThinkingContent | { type: string; text?: string; thinking?: string })[]
): { text: string; thinking: string } {
  let text = ""
  let thinking = ""
  for (const block of blocks) {
    if (block.type === "text" && "text" in block) text += block.text
    if (block.type === "thinking" && "thinking" in block) thinking += block.thinking
  }
  return { text, thinking }
}

export function extractAssistantMessageText(message: AssistantMessage): {
  content: string
  thinking: string
} {
  const { text, thinking } = textFromBlocks(message.content)
  return { content: text.trim(), thinking: thinking.trim() }
}

function toPiUserOrAssistant(m: PiChatMessage, model: ReturnType<typeof resolvePiChatModel>): Message {
  const ts = Date.now()
  if (m.role === "user") {
    return { role: "user", content: m.content, timestamp: ts }
  }
  return {
    role: "assistant",
    content: [{ type: "text", text: m.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: ts,
  }
}

function buildContext(
  history: PiChatMessage[],
  options?: { systemPrompt?: string; userInput?: string }
): Context {
  const systemParts = [
    ...history.filter((m) => m.role === "system").map((m) => m.content),
    options?.systemPrompt?.trim(),
  ].filter(Boolean)
  const model = resolvePiChatModel()
  const messages: Message[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => toPiUserOrAssistant(m, model))
  if (options?.userInput?.trim()) {
    messages.push({ role: "user", content: options.userInput.trim(), timestamp: Date.now() })
  }
  return {
    systemPrompt: systemParts.join("\n\n") || undefined,
    messages,
  }
}

async function ensureChatReady(userMessage?: string): Promise<void> {
  const route = resolveActiveChatRoute(userMessage)
  if (!route.modelId) {
    throw new Error("请先在「模型与连接」添加至少一个已启用的对话模型")
  }
  if (resolvedChatUsesApi(userMessage)) {
    activeModelId = route.modelId
    return
  }
  await ensureOllamaReady()
  activeModelId = route.modelId
}

export function getChatModelStatus() {
  const model = resolvePiChatModel()
  return {
    loaded: Boolean(activeModelId) || resolvedChatUsesApi(),
    modelPath: activeModelId ?? model.id,
    loadInfo: activeModelId
      ? {
          modelPath: activeModelId,
          contextSize: 8192,
          preferLowPower: false,
          layerSplit: "auto" as const,
          requestedLayerSplit: "auto" as const,
        }
      : null,
  }
}

export async function loadChatModel(
  modelName: string,
  options: { systemPrompt?: string } = {}
): Promise<NonNullable<ReturnType<typeof getChatModelStatus>["loadInfo"]>> {
  await ensureChatReady(modelName)
  activeModelId = modelName
  void options.systemPrompt
  return getChatModelStatus().loadInfo!
}

export async function unloadChatModel(): Promise<void> {
  activeModelId = null
}

export function resetChatHistory(): void {
  /* 无状态；历史由调用方 messages[] 传入 */
}

export function primeChatHistory(_messages: PiChatMessage[]): void {
  /* 兼容 IPC；pi-ai 每次请求自带 messages */
}

export function messagesToChatHistory(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): PiChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

export async function testPiConnection(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
  if (!resolvedChatUsesApi()) {
    return { ok: false, latencyMs: 0, error: "当前路由为 Ollama，请在 API 默认区或模型列表中配置 API 模型后测试" }
  }
  const started = Date.now()
  try {
    await piCompleteMessages(
      [{ role: "user", content: "reply with ok" }],
      { maxTokens: 16 }
    )
    return { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function piCompleteMessages(
  messages: PiChatMessage[],
  options?: { temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<string> {
  await ensureChatReady()
  const model = resolvePiChatModel()
  const context = buildContext(messages, { systemPrompt: options?.systemPrompt })
  const result = await completeSimple(model, context, {
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 4096,
    apiKey: resolveRouteApiKey(),
    reasoning: resolvePiReasoningOption(),
  })
  const { content } = extractAssistantMessageText(result)
  if (!content && result.errorMessage) throw new Error(result.errorMessage)
  return content
}

export async function chatPrompt(
  input: string,
  options: ChatPromptOptions = {}
): Promise<string> {
  return piCompleteMessages([{ role: "user", content: input }], {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  })
}

export async function runChatPromptStream(
  input: string,
  options: ChatPromptOptions & {
    primeMessages?: PiChatMessage[]
  },
  onDelta: (delta: ChatStreamDelta) => void
): Promise<string> {
  const prime = options.primeMessages ?? []
  return runPiChatStream(
    {
      messages: [...prime, { role: "user", content: input }],
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    },
    onDelta
  )
}

async function runPiChatStreamInner(
  context: Context,
  options: { temperature?: number; maxTokens?: number },
  onDelta: (delta: ChatStreamDelta) => void
): Promise<string> {
  await ensureChatReady()
  const model = resolvePiChatModel()
  const stream = streamSimple(model, context, {
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 4096,
    apiKey: resolveRouteApiKey(),
    reasoning: resolvePiReasoningOption(),
  })

  for await (const event of stream) {
    if (event.type === "thinking_delta" && event.delta) {
      onDelta({ segment: "thought", delta: event.delta })
    }
    if (event.type === "text_delta" && event.delta) {
      onDelta({ segment: "answer", delta: event.delta })
    }
  }

  const result = await stream.result()
  const { content } = extractAssistantMessageText(result)
  if (!content && result.errorMessage) throw new Error(result.errorMessage)
  return content
}

export async function runPiChatStream(
  params: {
    messages: PiChatMessage[]
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
  },
  onDelta: (delta: ChatStreamDelta) => void
): Promise<string> {
  const context = buildContext(params.messages, { systemPrompt: params.systemPrompt })
  return runPiChatStreamInner(
    context,
    { temperature: params.temperature, maxTokens: params.maxTokens },
    onDelta
  )
}
