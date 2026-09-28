import {
  completeSimple,
  streamSimple,
  type AssistantMessage,
  type Context,
  type Message,
  type TextContent,
  type ThinkingContent,
} from "@earendil-works/pi-ai/compat"

import { resolveAgentThinkingLevel, resolvePiChatModel } from "./pi-model"
import { resolveActiveChatRoute } from "./model-routing"
import { resolveEntryApiKey } from "./chat-model-entry"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import { isDashScopeOpenAiBaseUrl } from "../shared/coding-plan-catalog"

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

export function resolveRouteApiKey(userMessage?: string): string | undefined {
  const route = resolveActiveChatRoute()
  const entry = route.entry
  if (!entry) return undefined
  const provider = getSyncedRuntimeSettings().llmProvider
  return resolveEntryApiKey(entry, provider) || undefined
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
  const route = resolveActiveChatRoute()
  if (!route.modelId) {
    throw new Error("请先在「模型与连接」添加至少一个已启用的对话模型")
  }
  const settings = getSyncedRuntimeSettings()
  const key = route.entry
    ? resolveEntryApiKey(route.entry, settings.llmProvider)
    : settings.llmProvider.apiKey.trim()
  if (!key) {
    throw new Error("请配置 API Key")
  }
  activeModelId = route.modelId
  void userMessage
}

export async function testPiConnection(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
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
  const streamOptions = {
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 4096,
    apiKey: resolveRouteApiKey(),
    reasoning: resolvePiReasoningOption(),
  }

  // 百炼 OpenAI 兼容端点末包可能缺 finish_reason，用 streamSimple 替代 completeSimple
  // 关键：通过 onPayload 删除 stream_options 避免百炼发出额外的 usage-only 空包
  if (isDashScopeOpenAiBaseUrl(model.baseUrl ?? "")) {
    const stream = streamSimple(model, context, {
      ...streamOptions,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const p = payload as Record<string, unknown>
          delete p.stream_options
        }
        return payload
      },
    })
    let result: AssistantMessage
    try {
      result = await stream.result()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("finish_reason")) return ""
      throw err
    }
    const { content } = extractAssistantMessageText(result)
    if (content) return content
    if (result.errorMessage?.includes("finish_reason")) return ""
    if (result.errorMessage) throw new Error(result.errorMessage)
    return content
  }

  const result = await completeSimple(model, context, streamOptions)
  const { content } = extractAssistantMessageText(result)
  if (!content && result.errorMessage) throw new Error(result.errorMessage)
  return content
}


