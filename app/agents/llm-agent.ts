// Local LLM Agent - powered by @electron/llm

import { streamChat, type ChatMessage } from "~/services/llm"
import { getToolByName, getToolDefinitions } from "~/services/agent-tools"

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
  thinking?: string
  toolResults: { name: string; args: Record<string, unknown>; result: string }[]
  steps: number
}

export async function runAgent(
  messages: AgentMessage[],
  options: AgentOptions
): Promise<AgentResponse> {
  const maxSteps = options.maxSteps ?? 5
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.maxTokens ?? 2048
  const toolResults: AgentResponse["toolResults"] = []

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

  const toolDefinitions = getToolDefinitions()
  const toolSystemHint = `\n\n你可以使用以下工具。需要调用工具时，用 JSON 代码块输出 {"function":{"name":"tool_name","arguments":{...}}}：\n${JSON.stringify(toolDefinitions, null, 2)}`
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

  while (step < maxSteps) {
    options.onStep?.(step + 1, "调用模型...")

    for await (const chunk of streamChat(chatMessages, {
      temperature,
      maxTokens,
      onChunk: (content) => {
        lastContent = content
        options.onChunk?.(content)
      },
    })) {
      lastContent = chunk.content
      options.onChunk?.(chunk.content)
    }

    let hasToolCall = false

    try {
      const jsonMatch =
        lastContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i) ||
        lastContent.match(/(\{[\s\S]*?"function"[\s\S]*?\})/i)

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
            chatMessages.push({ role: "assistant", content: lastContent })
            chatMessages.push({ role: "user", content: `工具 ${toolName} 返回：\n${result.result}` })
          }
        }
      }
    } catch {
      hasToolCall = false
    }

    if (!hasToolCall) {
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
