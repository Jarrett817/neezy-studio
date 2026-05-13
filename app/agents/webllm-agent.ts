// WebLLM Agent - 基于 WebLLM 的 Agent 实现

import { streamChat, type ChatMessage } from "~/services/webllm"
import { getToolByName, getToolDefinitions, type ToolResult } from "~/services/agent-tools"

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
  onToolCall?: (name: string, args: Record<string, unknown>, result: string) => void
  onStep?: (step: number, action: string) => void
}

export type AgentResponse = {
  content: string
  toolResults: { name: string; args: Record<string, unknown>; result: string }[]
  steps: number
}

/**
 * 运行 WebLLM Agent 对话循环
 */
export async function runAgent(
  messages: AgentMessage[],
  options: AgentOptions
): Promise<AgentResponse> {
  const maxSteps = options.maxSteps ?? 5
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.maxTokens ?? 2048
  const toolResults: AgentResponse["toolResults"] = []

  // 构建消息
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

  // 添加工具定义
  const toolDefinitions = getToolDefinitions()
  const toolSystemHint = `\n\n你可以使用以下工具:\n${JSON.stringify(toolDefinitions, null, 2)}`
  if (chatMessages[0]?.role === "system") {
    chatMessages[0].content += toolSystemHint
  } else {
    chatMessages.unshift({
      role: "system",
      content: `你是一个智能助手，可以使用工具完成任务。${toolSystemHint}`,
    })
  }

  let step = 0
  let lastContent = ""
  let hasToolCall = false

  while (step < maxSteps) {
    options.onStep?.(step + 1, "调用模型...")

    // 使用流式对话
    const response = streamChat(chatMessages, {
      temperature,
      maxTokens,
      onChunk: (content) => {
        lastContent = content
        options.onChunk?.(content)
      },
    })

    // 收集响应 - 每个 chunk 都更新 lastContent，UI 实时显示
    for await (const chunk of response) {
      lastContent = chunk.content
      options.onChunk?.(chunk.content)
    }

    // 解析工具调用
    hasToolCall = false

    // 尝试从响应中提取工具调用
    try {
      // 查找 JSON 格式的工具调用
      const jsonMatch = lastContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i) ||
                       lastContent.match(/(\{[\s\S]*?"function_call"[\s\S]*?\})/i)

      if (jsonMatch) {
        const toolCall = JSON.parse(jsonMatch[1])
        if (toolCall.function?.name) {
          hasToolCall = true
          const toolName = toolCall.function.name
          const args = typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments || {}

          const tool = getToolByName(toolName)
          if (tool) {
            options.onStep?.(step + 1, `执行工具: ${toolName}`)
            const result = await tool.execute(args)
            options.onToolCall?.(toolName, args, result.result)
            toolResults.push({ name: toolName, args, result: result.result })

            chatMessages.push({ role: "tool", content: result.result })
          }
        }
      }
    } catch {
      // 没有工具调用，响应就是最终内容
    }

    if (!hasToolCall) {
      // 没有工具调用，添加助手响应并结束
      if (lastContent) {
        chatMessages.push({ role: "assistant", content: lastContent })
      }
      break
    }

    step++
  }

  return {
    content: lastContent,
    toolResults,
    steps: step,
  }
}