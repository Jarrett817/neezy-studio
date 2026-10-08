export type ChatWireToolCallStatus = "running" | "done" | "error"

export interface ChatWireToolCall {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  status: ChatWireToolCallStatus
  partialResult?: string
  result: string
}

/** 按 Pi 事件 / assistant.content 块顺序渲染，不在 UI 层重排 */
export type ChatWireActivityItem =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; toolCallId: string }
  | {
      kind: "workflow"
      id: string
      label: string
      detail?: string
      status: "active" | "done"
      variant?: "error"
    }

/** 主进程 ↔ 渲染进程对话消息 IPC 载荷（与 UI store 的 ChatMessage 同构）。 */
export interface ChatWireMessage {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
  activity?: ChatWireActivityItem[]
  toolCalls?: ChatWireToolCall[]
  /** 本条 assistant 的模型用量（多轮 LLM 调用累加），随会话落盘恢复 */
  usageSummary?: UsageSummaryWire
  timestamp: number
}

export interface UsageSummaryWire {
  input: number
  output: number
  costTotal: number
}

export function createUsageSummary(
  usage?: {
    input?: number
    output?: number
    cost?: { total?: number }
  } | null
): UsageSummaryWire {
  return {
    input: usage?.input ?? 0,
    output: usage?.output ?? 0,
    costTotal: usage?.cost?.total ?? 0,
  }
}

export function mergeUsageSummary(
  base: UsageSummaryWire | undefined,
  other: UsageSummaryWire
): UsageSummaryWire {
  return {
    input: (base?.input ?? 0) + other.input,
    output: (base?.output ?? 0) + other.output,
    costTotal: (base?.costTotal ?? 0) + other.costTotal,
  }
}

export interface ContextUsageWire {
  tokens: number | null
  contextWindow: number
  percent: number | null
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}

export function formatContextUsageTooltip(usage: ContextUsageWire): string {
  const limit = formatTokenCount(usage.contextWindow)
  if (usage.tokens == null) return `已用 — · 上限 ${limit}`
  const used = formatTokenCount(usage.tokens)
  if (usage.percent != null) {
    return `${Math.round(usage.percent)}% · ${used} / ${limit}`
  }
  return `已用 ${used} · 上限 ${limit}`
}

export function formatWireUsage(
  usage: UsageSummaryWire | null | undefined
): string | undefined {
  if (!usage) return undefined
  const { input, output, costTotal } = usage
  if (input === 0 && output === 0) return undefined
  const parts = [`输入 ${input}`, `输出 ${output}`]
  if (costTotal > 0) parts.push(`$${costTotal.toFixed(4)}`)
  return parts.join(" · ")
}
