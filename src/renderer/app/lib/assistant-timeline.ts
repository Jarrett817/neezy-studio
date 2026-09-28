import {
  formatToolArgsSummary,
  toolLabel,
  type AgentStep,
  type AssistantActivityItem,
  type ChatToolCall,
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

/** 按 activity 原样罗列；无 activity 时回退 thinking → tools → answer。usage 始终在末尾。 */
export function buildAssistantTimeline(input: {
  agentSteps?: AgentStep[]
  toolCalls?: ChatToolCall[]
  activity?: AssistantActivityItem[]
  thinking?: string
  content?: string
  usageSummary?: string
  isStreaming?: boolean
}): TimelineItem[] {
  const items: TimelineItem[] = []
  const toolCalls = input.toolCalls ?? []
  const toolById = new Map(toolCalls.map((t) => [t.toolCallId, t]))
  const activity = input.activity ?? []
  const streaming = Boolean(input.isStreaming)

  if (activity.length > 0) {
    const seenTools = new Set<string>()
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
      const tool = toolById.get(entry.toolCallId)
      if (!tool) continue
      seenTools.add(tool.toolCallId)
      items.push(toolToStepItem(tool))
    }
    for (const tool of toolCalls) {
      if (!seenTools.has(tool.toolCallId)) items.push(toolToStepItem(tool))
    }
    if (streaming) {
      const lastItem = items.at(-1)
      if (lastItem?.kind === "step") {
        items.push({ id: "answer-pending", kind: "answer", text: "", streaming: true })
      }
    }
  } else {
    const thinkingText = input.thinking?.trim() ?? ""
    if (thinkingText) {
      items.push({
        id: "thinking",
        kind: "thinking",
        text: thinkingText,
        streaming,
      })
    }
    for (const tool of toolCalls) {
      items.push(toolToStepItem(tool))
    }
    const answerText = input.content?.trim() ?? ""
    if (answerText || streaming) {
      items.push({
        id: "answer",
        kind: "answer",
        text: answerText,
        streaming,
      })
    }
  }

  const usage = input.usageSummary?.trim()
  if (usage) {
    items.push({ id: "usage", kind: "usage", text: usage })
  }

  return items
}

export function resolveWorkflowSteps(
  agentSteps: AgentStep[] | undefined,
  toolCalls: ChatToolCall[]
): AgentStep[] {
  return toolCalls.map((t) => ({
    id: `tool-${t.toolCallId}`,
    label: toolLabel(t.name),
    detail: formatToolArgsSummary(t.name, t.args),
    status: t.status === "running" ? ("active" as const) : ("done" as const),
    variant: t.status === "error" ? ("error" as const) : undefined,
  }))
}

export function agentStepsFromToolCalls(toolCalls: ChatToolCall[]): AgentStep[] {
  return resolveWorkflowSteps(undefined, toolCalls)
}
