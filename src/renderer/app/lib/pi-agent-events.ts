import type { AgentEventPayload } from "~/services/pi-agent-client"

export type PiAgentStreamState = {
  content: string
  thinking: string
}

export function extractTextFromAssistantMessage(message: {
  role: string
  content?: unknown
}): PiAgentStreamState {
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return { content: "", thinking: "" }
  }
  let content = ""
  let thinking = ""
  for (const block of message.content as { type: string; text?: string; thinking?: string }[]) {
    if (block.type === "text" && block.text) content += block.text
    if (block.type === "thinking" && block.thinking) thinking += block.thinking
  }
  return { content, thinking }
}

export function reduceAgentEvent(
  event: AgentEventPayload["event"],
  prev: PiAgentStreamState
): PiAgentStreamState {
  switch (event.type) {
    case "message_update": {
      const inner = event.assistantMessageEvent as { type?: string; delta?: string }
      if (inner.type === "text_delta" && inner.delta) {
        return { ...prev, content: prev.content + inner.delta }
      }
      if (inner.type === "thinking_delta" && inner.delta) {
        return { ...prev, thinking: prev.thinking + inner.delta }
      }
      const fromMsg = extractTextFromAssistantMessage(
        event.message as { role: string; content?: unknown }
      )
      if (fromMsg.content || fromMsg.thinking) return fromMsg
      return prev
    }
    case "message_end": {
      return extractTextFromAssistantMessage(
        event.message as { role: string; content?: unknown }
      )
    }
    default:
      return prev
  }
}
