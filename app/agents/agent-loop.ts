import { type Message as OllamaMessage } from "ollama/browser"
import { streamChat, chat } from "~/services/ollama-chat"
import { getToolByName, getToolDefinitions, type ToolResult } from "~/services/agent-tools"

export type AgentMessage = {
  role: "user" | "assistant" | "system" | "tool"
  content: string
}

export type AgentOptions = {
  model: string
  systemPrompt?: string
  maxSteps?: number
  onChunk?: (content: string, thinking: string) => void
  onToolCall?: (name: string, args: Record<string, unknown>, result: string) => void
  onStep?: (step: number, action: string) => void
}

export type AgentResponse = {
  content: string
  thinking: string
  toolResults: { name: string; args: Record<string, unknown>; result: string }[]
  steps: number
}

/**
 * 运行 Agent 对话循环
 */
export async function runAgent(
  messages: AgentMessage[],
  options: AgentOptions
): Promise<AgentResponse> {
  const maxSteps = options.maxSteps ?? 5
  const toolResults: AgentResponse["toolResults"] = []

  // 构建初始消息
  const chatMessages: OllamaMessage[] = []
  if (options.systemPrompt) {
    chatMessages.push({ role: "system", content: options.systemPrompt })
  }
  for (const msg of messages) {
    chatMessages.push({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    })
  }

  // 添加工具定义到系统提示
  const toolDefinitions = getToolDefinitions()
  const toolSystemHint = `\n\n你可以使用以下工具:\n${JSON.stringify(toolDefinitions, null, 2)}`
  if (chatMessages[0]?.role === "system") {
    chatMessages[0].content += toolSystemHint
  } else {
    chatMessages.unshift({ role: "system", content: `你是一个智能助手，可以使用工具完成任务。${toolSystemHint}` })
  }

  let step = 0
  let lastContent = ""
  let lastThinking = ""

  while (step < maxSteps) {
    options.onStep?.(step + 1, "调用模型...")

    // 使用流式对话，传入工具定义
    let hasToolCall = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await streamChat({
      model: options.model,
      messages: chatMessages,
      temperature: 0.7,
      maxTokens: 2048,
      tools: getToolDefinitions() as any,
      onChunk: (content, thinking) => {
        lastContent = content
        lastThinking = thinking
        options.onChunk?.(content, thinking)
      },
    })

    // 收集完整响应
    for await (const chunk of response) {
      if (chunk.toolCalls && chunk.toolCalls.length > 0) {
        hasToolCall = true
        for (const tc of chunk.toolCalls) {
          const tool = getToolByName(tc.function.name)
          if (!tool) {
            chatMessages.push({
              role: "tool",
              content: `未知工具: ${tc.function.name}`,
            })
            continue
          }

          try {
            const args = typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments
            options.onStep?.(step + 1, `执行工具: ${tc.function.name}`)
            const result = await tool.execute(args)
            options.onToolCall?.(tc.function.name, args, result.result)
            toolResults.push({ name: tc.function.name, args, result: result.result })
            chatMessages.push({
              role: "tool",
              content: result.result,
            })
          } catch (e) {
            const errorMsg = `工具执行失败: ${e}`
            chatMessages.push({ role: "tool", content: errorMsg })
          }
        }
        break // 工具调用后重新循环
      }
    }

    if (!hasToolCall) {
      // 没有更多工具调用，完成
      break
    }

    step++
  }

  return {
    content: lastContent,
    thinking: lastThinking,
    toolResults,
    steps: step,
  }
}