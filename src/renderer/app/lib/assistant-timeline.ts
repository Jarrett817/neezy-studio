import {
  type AgentStep,
  type AssistantActivityItem,
  type ChatToolCall,
  formatToolArgsSummary,
  toolLabel,
} from "~/lib/agent-steps"

export type TimelineItem =
  | { id: string; kind: "step"; step: AgentStep; tool?: ChatToolCall }
  | { id: string; kind: "thinking"; text: string; streaming?: boolean }
  | { id: string; kind: "usage"; text: string }
  | { id: string; kind: "answer"; text: string; streaming?: boolean }

function toolToStepItem(tool: ChatToolCall): TimelineItem {
  const stepId = `tool-${tool.toolCallId}`
  return {
    id: stepId,
    kind: "step",
    step: {
      id: stepId,
      label: toolLabel(tool.name),
      detail: formatToolArgsSummary(tool.name, tool.args),
      status: tool.status === "running" ? "active" : "done",
      variant: tool.status === "error" ? "error" : undefined,
    },
    tool,
  }
}

function workflowToStepItem(
  entry: Extract<AssistantActivityItem, { kind: "workflow" }>
): TimelineItem {
  return {
    id: entry.id,
    kind: "step",
    step: {
      id: entry.id,
      label: entry.label,
      detail: entry.detail,
      status: entry.status === "active" ? "active" : "done",
      variant: entry.variant,
    },
  }
}

/** 严格按 Pi activity 顺序渲染；toolCalls 仅作 toolCallId 详情表 */
export function buildAssistantTimeline(input: {
  toolCalls?: ChatToolCall[]
  activity?: AssistantActivityItem[]
  usageSummary?: string
  isStreaming?: boolean
}): TimelineItem[] {
  const items: TimelineItem[] = []
  const toolById = new Map(
    (input.toolCalls ?? []).map((t) => [t.toolCallId, t])
  )
  const activity = input.activity ?? []
  const streaming = Boolean(input.isStreaming)
  const last = activity.at(-1)

  for (const entry of activity) {
    const isLast = entry === last
    if (entry.kind === "thinking") {
      const text = entry.text.trim()
      if (!text && !streaming) continue
      items.push({
        id: entry.id,
        kind: "thinking",
        text,
        streaming: streaming && isLast,
      })
      continue
    }
    if (entry.kind === "text") {
      items.push({
        id: entry.id,
        kind: "answer",
        text: entry.text,
        streaming: streaming && isLast,
      })
      continue
    }
    if (entry.kind === "workflow") {
      items.push(workflowToStepItem(entry))
      continue
    }
    const tool = toolById.get(entry.toolCallId)
    if (tool) items.push(toolToStepItem(tool))
  }

  if (streaming) {
    const lastItem = items.at(-1)
    if (lastItem?.kind === "step" && lastItem.tool) {
      items.push({
        id: "answer-pending",
        kind: "answer",
        text: "",
        streaming: true,
      })
    }
  }

  const usage = input.usageSummary?.trim()
  if (usage) {
    items.push({ id: "usage", kind: "usage", text: usage })
  }

  return items
}
