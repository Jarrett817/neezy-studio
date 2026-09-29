import type {
  AgentSessionEvent,
  AssistantMessage,
} from "../../../shared/pi-sdk"

export type PiAgentStreamState = {
  content: string
  thinking: string
}

export function textFromAssistantMessage(
  message: AssistantMessage
): PiAgentStreamState {
  if (!Array.isArray(message.content)) {
    return { content: "", thinking: "" }
  }
  let content = ""
  let thinking = ""
  for (const block of message.content) {
    if (block.type === "text") content += block.text
    if (block.type === "thinking") thinking += block.thinking
  }
  return { content, thinking }
}

export function reduceAgentEvent(
  event: AgentSessionEvent,
  prev: PiAgentStreamState
): PiAgentStreamState {
  switch (event.type) {
    case "message_update": {
      const inner = event.assistantMessageEvent
      if (inner.type === "text_delta" && inner.delta) {
        return { ...prev, content: prev.content + inner.delta }
      }
      if (inner.type === "thinking_delta" && inner.delta) {
        return { ...prev, thinking: prev.thinking + inner.delta }
      }
      if (event.message.role === "assistant") {
        const fromMsg = textFromAssistantMessage(event.message)
        if (fromMsg.content || fromMsg.thinking) return fromMsg
      }
      return prev
    }
    case "message_end": {
      if (event.message.role === "assistant") {
        const fromMsg = textFromAssistantMessage(event.message)
        // 部分网关末包无 content；勿用空消息覆盖已累计的 delta
        if (fromMsg.content || fromMsg.thinking) return fromMsg
      }
      return prev
    }
    default:
      return prev
  }
}
