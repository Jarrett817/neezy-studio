import ollama, { type Message as OllamaMessage } from "ollama/browser"

export type ChatOptions = {
  model: string
  messages: OllamaMessage[]
  temperature?: number
  maxTokens?: number
  tools?: OllamaMessage["tool_calls"]
  onChunk?: (content: string, thinking: string) => void
}

/**
 * 流式对话 - 使用 Ollama 的 AbortableAsyncIterator
 * 每个 chunk 实时 yield，让 UI 立即更新
 */
export async function* streamChat(options: ChatOptions): AsyncGenerator<{
  content: string
  thinking: string
  done: boolean
  toolCalls?: OllamaMessage["tool_calls"]
}> {
  // tools 参数需要正确类型，这里做一下类型转换
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatOptions: any = {
    model: options.model,
    messages: options.messages,
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2048,
    },
  }
  if (options.tools) {
    chatOptions.tools = options.tools
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (ollama.chat as any)(chatOptions) as AsyncGenerator<{
    message: { content?: string; thinking?: string; tool_calls?: OllamaMessage["tool_calls"] }
    done?: boolean
  }>

  let accumulatedContent = ""
  let accumulatedThinking = ""

  for await (const part of response) {
    const chunk = part.message?.content || ""
    const chunkThinking = part.message?.thinking || ""

    if (chunk) {
      accumulatedContent += chunk
    }
    if (chunkThinking) {
      accumulatedThinking += chunkThinking
    }

    // 实时回调让 UI 立即更新
    options.onChunk?.(accumulatedContent, accumulatedThinking)

    // 每个 chunk 都 yield，让调用方能立即获取
    yield {
      content: accumulatedContent,
      thinking: accumulatedThinking,
      done: part.done ?? false,
      toolCalls: part.message?.tool_calls,
    }
  }
}

/**
 * 非流式对话（用于简单请求）
 */
export async function chat(options: Omit<ChatOptions, "onChunk">): Promise<{
  content: string
  thinking: string
  toolCalls?: OllamaMessage["tool_calls"]
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatOptions: any = {
    model: options.model,
    messages: options.messages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2048,
    },
  }
  if (options.tools) {
    chatOptions.tools = options.tools
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (ollama.chat as any)(chatOptions)

  return {
    content: response.message?.content || "",
    thinking: response.message?.thinking || "",
    toolCalls: response.message?.tool_calls,
  }
}