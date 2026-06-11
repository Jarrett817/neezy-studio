import {
  formatToolArgsSummary,
  toolLabel,
  type AgentStep,
  type ChatToolCall,
} from "~/lib/agent-steps"

export type TimelineItem =
  | { id: string; kind: "step"; step: AgentStep; tool?: ChatToolCall }
  | { id: string; kind: "thinking"; text: string }
  | { id: string; kind: "usage"; text: string }
  | { id: string; kind: "answer"; text: string; streaming?: boolean }

/**
 * 构建线性工作流 timeline。
 * 顺序：thinking → 工具调用（按出现顺序）→ 最终回复。
 * 去掉抽象的 "规划中/分析中" 步骤，只展示实际动作。
 */
export function buildAssistantTimeline(input: {
  agentSteps?: AgentStep[]
  toolCalls?: ChatToolCall[]
  thinking?: string
  content?: string
  usageSummary?: string
  isStreaming?: boolean
}): TimelineItem[] {
  const items: TimelineItem[] = []
  const toolCalls = input.toolCalls ?? []

  // 1. 思考过程（如果有）
  const thinkingText = input.thinking?.trim() ?? ""
  if (thinkingText) {
    items.push({ id: "thinking", kind: "thinking", text: thinkingText })
  }

  // 2. 工具调用（按顺序，每个都是独立步骤）
  for (const tool of toolCalls) {
    const stepId = `tool-${tool.toolCallId}`
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

  // 3. Token 用量
  const usage = input.usageSummary?.trim()
  if (usage) {
    items.push({ id: "usage", kind: "usage", text: usage })
  }

  // 4. 最终回复
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

// 兼容旧代码引用
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
