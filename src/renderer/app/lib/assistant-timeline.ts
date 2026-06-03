import {
  formatToolArgsSummary,
  toolLabel,
  type AgentStep,
  type ChatToolCall,
} from "~/lib/agent-steps"

export type TimelineItem =
  | {
      id: string
      kind: "step"
      step: AgentStep
      tool?: ChatToolCall
    }
  | { id: string; kind: "thinking"; text: string }
  | { id: string; kind: "usage"; text: string }
  | { id: string; kind: "answer"; text: string; streaming?: boolean }

function toolCallIdFromStepId(stepId: string): string | null {
  return stepId.startsWith("tool-") ? stepId.slice("tool-".length) : null
}

function toolCallsById(toolCalls: ChatToolCall[]): Map<string, ChatToolCall> {
  return new Map(toolCalls.map((t) => [t.toolCallId, t]))
}

export function agentStepsFromToolCalls(toolCalls: ChatToolCall[]): AgentStep[] {
  return toolCalls.map((t) => ({
    id: `tool-${t.toolCallId}`,
    label: toolLabel(t.name),
    detail: formatToolArgsSummary(t.name, t.args),
    status: t.status === "running" ? ("active" as const) : ("done" as const),
    variant: t.status === "error" ? ("error" as const) : undefined,
  }))
}

export function resolveWorkflowSteps(
  agentSteps: AgentStep[] | undefined,
  toolCalls: ChatToolCall[]
): AgentStep[] {
  const fromAgent = (agentSteps ?? []).filter(
    (s) => s.status === "active" || s.status === "done"
  )
  if (fromAgent.length > 0) return fromAgent
  return agentStepsFromToolCalls(toolCalls)
}

export function buildAssistantTimeline(input: {
  agentSteps?: AgentStep[]
  toolCalls?: ChatToolCall[]
  thinking?: string
  content?: string
  usageSummary?: string
  isStreaming?: boolean
}): TimelineItem[] {
  const toolCalls = input.toolCalls ?? []
  const tools = toolCallsById(toolCalls)
  const steps = resolveWorkflowSteps(input.agentSteps, toolCalls)
  const items: TimelineItem[] = []

  const thinkingText = input.thinking?.trim() ?? ""
  let thinkingInserted = false

  for (const step of steps) {
    const toolId = toolCallIdFromStepId(step.id)
    const tool = toolId ? tools.get(toolId) : undefined
    items.push({ id: step.id, kind: "step", step, tool })
    if (thinkingText && step.id === "turn" && !thinkingInserted) {
      items.push({ id: "thinking", kind: "thinking", text: thinkingText })
      thinkingInserted = true
    }
  }

  if (thinkingText && !thinkingInserted) {
    items.push({ id: "thinking", kind: "thinking", text: thinkingText })
  }

  for (const tool of toolCalls) {
    const stepId = `tool-${tool.toolCallId}`
    if (items.some((i) => i.kind === "step" && i.id === stepId)) continue
    items.push({
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
    })
  }

  const usage = input.usageSummary?.trim()
  if (usage) {
    items.push({ id: "usage", kind: "usage", text: usage })
  }

  const answer = input.content?.trim() ?? ""
  if (answer || input.isStreaming) {
    items.push({
      id: "answer",
      kind: "answer",
      text: answer,
      streaming: input.isStreaming,
    })
  }

  return items
}
