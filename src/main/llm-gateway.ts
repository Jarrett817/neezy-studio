import { createOpenAI } from "@ai-sdk/openai"
import { generateText, streamText } from "ai"

import { resolveProviderBaseUrl } from "./llm-presets"
import { getSyncedRuntimeSettings, usesOpenAiCompatibleChat } from "./runtime-settings"
import type { ChatLoadResult, ChatPromptOptions, ChatStreamDelta } from "./types"

type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

let activeModel: string | null = null
let chatMessages: ChatMessage[] = []
let lastLoadInfo: ChatLoadResult | null = null

function requireProvider() {
  const settings = getSyncedRuntimeSettings()
  const { llmProvider } = settings
  const apiKey = llmProvider.apiKey.trim()
  if (!apiKey) {
    throw new Error("未配置 API Key，请在「AI 连接」中填写")
  }
  const baseURL = resolveProviderBaseUrl(llmProvider)
  if (!baseURL) {
    throw new Error("未配置 API Base URL")
  }
  const model = activeModel ?? llmProvider.model.trim()
  if (!model) {
    throw new Error("未配置模型名称")
  }
  const openai = createOpenAI({ baseURL, apiKey })
  return { model: openai.chat(model), modelId: model }
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
  const settings = getSyncedRuntimeSettings()
  const model = modelName.trim() || settings.llmProvider.model.trim()
  if (!model) throw new Error("未配置模型名称")
  activeModel = model
  chatMessages = options.systemPrompt
    ? [{ role: "system", content: options.systemPrompt }]
    : []
  lastLoadInfo = {
    modelPath: model,
    contextSize: 128000,
    preferLowPower: Boolean(options.preferLowPower),
    layerSplit: "auto",
    requestedLayerSplit: "auto",
  }
  return lastLoadInfo
}

export async function unloadChatModel(): Promise<void> {
  activeModel = null
  chatMessages = []
  lastLoadInfo = null
}

export function resetChatHistory(): void {
  const system = chatMessages.find((m) => m.role === "system")
  chatMessages = system ? [system] : []
}

export function primeChatHistory(messages: ChatMessage[]): void {
  chatMessages = messages.map((m) => ({ role: m.role, content: m.content }))
}

export function messagesToChatHistory(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): ChatMessage[] {
  return messages
}

export async function testLlmConnection(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
  if (!usesOpenAiCompatibleChat()) {
    return { ok: false, latencyMs: 0, error: "当前为 Ollama 模式，请切换到 API 后再测试" }
  }
  const started = Date.now()
  try {
    const { model } = requireProvider()
    await generateText({
      model,
      prompt: "reply with ok",
      maxOutputTokens: 16,
    })
    return { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runGeneration(
  options: ChatPromptOptions,
  onDelta?: (delta: ChatStreamDelta) => void
): Promise<string> {
  const { model } = requireProvider()
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.maxTokens ?? 4096

  if (!onDelta) {
    const { text } = await generateText({
      model,
      messages: chatMessages,
      temperature,
      maxOutputTokens: maxTokens,
    })
    return text.trim()
  }

  const result = streamText({
    model,
    messages: chatMessages,
    temperature,
    maxOutputTokens: maxTokens,
  })

  let full = ""
  for await (const chunk of result.textStream) {
    if (!chunk) continue
    full += chunk
    onDelta({ segment: "answer", delta: chunk })
  }
  return full.trim()
}

async function chatWithUser(
  userInput: string,
  options: ChatPromptOptions,
  onDelta?: (delta: ChatStreamDelta) => void
): Promise<string> {
  chatMessages.push({ role: "user", content: userInput })
  const text = await runGeneration(options, onDelta)
  chatMessages.push({ role: "assistant", content: text })
  return text
}

export async function chatPrompt(
  input: string,
  options: ChatPromptOptions = {}
): Promise<string> {
  if (!activeModel) throw new Error("对话模型未配置")
  return chatWithUser(input, { ...options, useFunctions: false })
}

export async function runChatPromptStream(
  input: string,
  options: ChatPromptOptions,
  onDelta: (delta: ChatStreamDelta) => void
): Promise<void> {
  if (!activeModel) throw new Error("对话模型未配置")
  await chatWithUser(input, options, onDelta)
}
