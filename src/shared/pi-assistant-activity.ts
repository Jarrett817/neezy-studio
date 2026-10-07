import type { ChatWireActivityItem, ChatWireToolCall } from "./chat-wire"

export function activityFromAssistantContent(
  content: unknown,
  timestamp: number
): { activity: ChatWireActivityItem[]; toolCalls: ChatWireToolCall[] } {
  if (typeof content === "string") {
    const text = content.trim()
    return {
      activity: text
        ? [{ kind: "text", id: `text-${timestamp}`, text: content }]
        : [],
      toolCalls: [],
    }
  }
  if (!Array.isArray(content)) return { activity: [], toolCalls: [] }
  const activity: ChatWireActivityItem[] = []
  const toolCalls: ChatWireToolCall[] = []
  const seenToolIds = new Set<string>()
  let i = 0
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block)) continue
    if (
      block.type === "thinking" &&
      "thinking" in block &&
      typeof block.thinking === "string"
    ) {
      const text = block.thinking.trim()
      if (text)
        activity.push({
          kind: "thinking",
          id: `thinking-${timestamp}-${i}`,
          text,
        })
      i += 1
      continue
    }
    if (
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      const text = block.text.trim()
      if (text)
        activity.push({
          kind: "text",
          id: `text-${timestamp}-${i}`,
          text: block.text,
        })
      i += 1
      continue
    }
    if (block.type === "toolCall") {
      const record = block as {
        id?: string
        name?: string
        arguments?: Record<string, unknown>
      }
      const toolCallId = typeof record.id === "string" ? record.id.trim() : ""
      const name = typeof record.name === "string" ? record.name.trim() : ""
      if (!toolCallId || !name || seenToolIds.has(toolCallId)) continue
      seenToolIds.add(toolCallId)
      const args =
        record.arguments && typeof record.arguments === "object"
          ? record.arguments
          : {}
      toolCalls.push({ toolCallId, name, args, status: "running", result: "" })
      activity.push({ kind: "tool", toolCallId })
      i += 1
    }
  }
  return { activity, toolCalls }
}

/** 流式阶段多次 message_end 时合并 activity，避免后一段覆盖思考/工具步骤 */
export function mergeAssistantActivity(
  current: ChatWireActivityItem[],
  incoming: ChatWireActivityItem[]
): ChatWireActivityItem[] {
  if (incoming.length === 0) return current
  const merged = [...current]
  for (const item of incoming) {
    if (item.kind === "tool") {
      if (
        !merged.some(
          (a) => a.kind === "tool" && a.toolCallId === item.toolCallId
        )
      ) {
        merged.push(item)
      }
      continue
    }
    if (item.kind === "thinking") {
      const trimmed = item.text.trim()
      if (!trimmed) continue
      if (
        merged.some((a) => a.kind === "thinking" && a.text.trim() === trimmed)
      ) {
        continue
      }
      const partialIdx = merged.findIndex(
        (a) =>
          a.kind === "thinking" &&
          trimmed.startsWith(a.text.trim()) &&
          trimmed.length > a.text.trim().length
      )
      if (partialIdx >= 0) {
        merged[partialIdx] = {
          kind: "thinking",
          id: merged[partialIdx].id,
          text: item.text,
        }
        continue
      }
      merged.push(item)
      continue
    }
    if (item.kind === "text") {
      const trimmed = item.text.trim()
      if (!trimmed) continue
      if (merged.some((a) => a.kind === "text" && a.text.trim() === trimmed)) {
        continue
      }
      const partialIdx = merged.findIndex(
        (a) =>
          a.kind === "text" &&
          trimmed.startsWith(a.text.trim()) &&
          trimmed.length > a.text.trim().length
      )
      if (partialIdx >= 0) {
        merged[partialIdx] = {
          kind: "text",
          id: merged[partialIdx].id,
          text: item.text,
        }
        continue
      }
      merged.push(item)
    }
  }
  return merged
}
