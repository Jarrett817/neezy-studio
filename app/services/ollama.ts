import ollama, { type ChatResponse, type Message } from "ollama/browser"

export type OllamaModel = Awaited<ReturnType<typeof ollama.list>>["models"][number]

export type ProgressResponse = {
  status: string
  digest: string
  total: number
  completed: number
}

// Ollama 主机地址，默认 http://127.0.0.1:11434
// 可通过环境变量 OLLAMA_HOST 覆盖
export function getOllamaHost(): string {
  return process.env?.OLLAMA_HOST || "http://127.0.0.1:11434"
}

// 检查 Ollama 是否运行（直接 HTTP 检测）
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaHost()}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}

// 列出已下载的模型
export async function listOllamaModels(): Promise<OllamaModel[]> {
  const response = await ollama.list()
  return response.models || []
}

// 下载模型（流式进度）
export async function pullOllamaModel(
  modelName: string,
  onProgress?: (progress: ProgressResponse) => void
): Promise<void> {
  const response = await ollama.pull({ model: modelName, stream: true })
  for await (const part of response) {
    if (part.status) {
      onProgress?.({
        status: part.status,
        digest: part.digest || "",
        total: part.total || 0,
        completed: part.completed || 0,
      })
    }
  }
}

// 删除模型
export async function deleteOllamaModel(modelName: string): Promise<void> {
  await ollama.delete({ model: modelName })
}

// 获取模型信息
export async function showOllamaModel(modelName: string): Promise<Awaited<ReturnType<typeof ollama.show>>> {
  return ollama.show({ model: modelName })
}

// 文本生成（流式）
export async function generateText(options: {
  model: string
  prompt: string
  system?: string
  temperature?: number
  maxTokens?: number
  onChunk?: (text: string) => void
}): Promise<string> {
  const response = await ollama.generate({
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 1024,
    },
  })
  let result = ""
  for await (const part of response) {
    result += part.response
    options.onChunk?.(part.response)
  }
  return result
}

// 对话（流式）
export async function chat(options: {
  model: string
  messages: Message[]
  temperature?: number
  maxTokens?: number
  onChunk?: (content: string, thinking: string) => void
}): Promise<{ content: string; thinking: string }> {
  const response = await ollama.chat({
    model: options.model,
    messages: options.messages,
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 1024,
    },
  })
  let content = ""
  let thinking = ""
  for await (const part of response) {
    const chunk = part.message.content || ""
    const chunkThinking = part.message.thinking || ""
    if (chunk) content += chunk
    if (chunkThinking) thinking += chunkThinking
    if (chunk || chunkThinking) {
      options.onChunk?.(content, thinking)
    }
  }
  return { content, thinking }
}

// 获取 embedding
export async function getEmbeddings(text: string, model = "nomic-embed-text"): Promise<number[]> {
  const response = await ollama.embeddings({ model, prompt: text })
  return response.embedding
}
