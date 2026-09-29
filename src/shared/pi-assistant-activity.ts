import type { ChatWireActivityItem, ChatWireToolCall } from "./chat-wire"

export function activityFromAssistantContent(
  content: unknown,
  timestamp: number
): { activity: ChatWireActivityItem[]; toolCalls: ChatWireToolCall[] } {
  if (typeof content === "string") {
    const text = content.trim()
    return {
      activity: text ? [{ kind: "text", id: `text-${timestamp}`, text: content }] : [],
      toolCalls: [],
    }
  }
  if (!Array.isArray(content)) return { activity: [], toolCalls: [] }
  const activity: ChatWireActivityItem[] = []
  const toolCalls: ChatWireToolCall[] = []
  let i = 0
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block)) continue
    if (block.type === "thinking" && "thinking" in block && typeof block.thinking === "string") {
      const text = block.thinking.trim()
      if (text) activity.push({ kind: "thinking", id: `thinking-${timestamp}-${i}`, text })
      i += 1
      continue
    }
    if (block.type === "text" && "text" in block && typeof block.text === "string") {
      const text = block.text.trim()
      if (text) activity.push({ kind: "text", id: `text-${timestamp}-${i}`, text: block.text })
      i += 1
      continue
    }
    if (block.type === "toolCall") {
      const record = block as { id?: string; name?: string; arguments?: Record<string, unknown> }
      const toolCallId = typeof record.id === "string" ? record.id.trim() : ""
      const name = typeof record.name === "string" ? record.name.trim() : ""
      if (!toolCallId || !name) continue
      const args =
        record.arguments && typeof record.arguments === "object" ? record.arguments : {}
      toolCalls.push({ toolCallId, name, args, status: "running", result: "" })
      activity.push({ kind: "tool", toolCallId })
      i += 1
    }
  }
  return { activity, toolCalls }
}
