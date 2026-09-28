export type ChatWireToolCallStatus = "running" | "done" | "error"

export interface ChatWireToolCall {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  status: ChatWireToolCallStatus
  partialResult?: string
  result: string
}

/** 按 Pi assistant.content 块顺序：思考 / 正文 / 工具 */
export type ChatWireActivityItem =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; toolCallId: string }

/** 主进程 ↔ 渲染进程对话消息 IPC 载荷（与 UI store 的 ChatMessage 同构）。 */
export interface ChatWireMessage {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
  activity?: ChatWireActivityItem[]
  toolCalls?: ChatWireToolCall[]
  /** 本条 assistant 的模型用量，随会话落盘恢复 */
  usageSummary?: string
  timestamp: number
}

export interface ContextUsageWire {
  tokens: number | null
  contextWindow: number
  percent: number | null
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}

export function formatContextUsage(usage: ContextUsageWire): string {
  const limit = formatTokenCount(usage.contextWindow)
  if (usage.tokens == null || usage.percent == null) return `上下文 — / ${limit}`
  return `上下文 ${formatTokenCount(usage.tokens)} / ${limit} · ${Math.round(usage.percent)}%`
}

export function formatWireUsage(usage: {
  input?: number
  output?: number
  cost?: { total?: number }
} | null | undefined): string | undefined {
  if (!usage) return undefined
  const input = usage.input ?? 0
  const output = usage.output ?? 0
  if (input === 0 && output === 0) return undefined
  const parts = [`输入 ${input}`, `输出 ${output}`]
  const total = usage.cost?.total
  if (total != null && total > 0) parts.push(`$${total.toFixed(4)}`)
  return parts.join(" · ")
}
