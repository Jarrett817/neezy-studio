// Local LLM Agent — node-llama-cpp function calling（主进程）

import {
  streamChat,
  type ChatMessage,
  type ChatStreamUpdate,
} from "~/services/llm"

export type AgentMessage = {
  role: "user" | "assistant" | "system" | "tool"
  content: string
}

export type AgentOptions = {
  systemPrompt?: string
  maxSteps?: number
  temperature?: number
  maxTokens?: number
  onChunk?: (content: string) => void
  onStream?: (update: ChatStreamUpdate) => void
  onToolCall?: (
    name: string,
    args: Record<string, unknown>,
    result: string
  ) => void
  onStep?: (step: number, action: string) => void
  onPhase?: (
    phase: "prepare" | "model" | "tool" | "writing",
    detail?: string
  ) => void
}

export type AgentResponse = {
  content: string
  thinking?: string
  toolResults: { name: string; args: Record<string, unknown>; result: string }[]
  steps: number
}

export async function runAgent(
  messages: AgentMessage[],
  options: AgentOptions
): Promise<AgentResponse> {
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.maxTokens ?? 2048

  const chatMessages: ChatMessage[] = []
  if (options.systemPrompt) {
    chatMessages.push({ role: "system", content: options.systemPrompt })
  }

  for (const msg of messages) {
    if (msg.role !== "tool") {
      chatMessages.push({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })
    }
  }

  options.onPhase?.("model", "推理")
  options.onStep?.(1, "推理")

  let lastContent = ""
  let lastThinking = ""

  for await (const chunk of streamChat(chatMessages, {
    temperature,
    maxTokens,
    useFunctions: true,
    onStream: (update) => {
      lastContent = update.content
      lastThinking = update.thinking
      if (update.thinking.length > 0) options.onPhase?.("model", "深度推理中")
      else if (update.content.length > 0) options.onPhase?.("writing", "组织语言")
      options.onStream?.(update)
      options.onChunk?.(update.content)
    },
  })) {
    lastContent = chunk.content
    lastThinking = chunk.thinking
  }

  return {
    content: lastContent,
    thinking: lastThinking || undefined,
    toolResults: [],
    steps: 1,
  }
}
