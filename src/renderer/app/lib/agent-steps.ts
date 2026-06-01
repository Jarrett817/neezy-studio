export type AgentStepStatus = "pending" | "active" | "done"

export type AgentStep = {
  id: string
  label: string
  detail?: string
  status: AgentStepStatus
  /** 工具步骤为 error 时用于 UI 强调 */
  variant?: "error"
}

export type { ChatWireToolCall as ChatToolCall } from "../../../shared/chat-wire"

export const TOOL_LABELS: Record<string, string> = {
  memory_search: "查阅记忆",
  memory_add: "写入记忆",
  memory_event: "记录片段",
  web_search: "网页搜索",
  code_search: "代码搜索",
  fetch_content: "抓取网页",
  read: "读取文件",
  bash: "执行命令",
  edit: "编辑文件",
  write: "写入文件",
  grep: "搜索内容",
  find: "查找文件",
  ls: "列出目录",
}

export function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? "处理信息"
}

const TOOL_ARG_KEYS: Record<string, string[]> = {
  read: ["path", "file"],
  edit: ["path", "file"],
  write: ["path", "file"],
  bash: ["command"],
  grep: ["pattern", "path"],
  find: ["pattern", "path"],
  ls: ["path"],
  memory_search: ["query", "q"],
  memory_add: ["title"],
  memory_event: ["text", "content"],
}

function pickArgString(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = args[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

export function formatToolArgsSummary(
  toolName: string,
  args: Record<string, unknown>
): string {
  const keys = TOOL_ARG_KEYS[toolName]
  if (keys) {
    const picked = pickArgString(args, keys)
    if (picked) return truncateThinkingPreview(picked, 120)
  }
  const compact = JSON.stringify(args)
  if (!compact || compact === "{}") return "执行中…"
  return truncateThinkingPreview(compact, 120)
}

export function formatToolPartialPreview(partial: unknown): string {
  const text =
    typeof partial === "string"
      ? partial
      : partial == null
        ? ""
        : JSON.stringify(partial)
  return truncateThinkingPreview(text.replace(/\s+/g, " ").trim(), 200)
}

export function formatToolResultPreview(result: unknown, isError: boolean): string {
  const text =
    typeof result === "string"
      ? result
      : result == null
        ? ""
        : JSON.stringify(result)
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (!trimmed) return isError ? "失败" : "已完成"
  return truncateThinkingPreview(trimmed, isError ? 240 : 160)
}

export function formatUsageSummary(usage: {
  input: number
  output: number
  totalTokens?: number
  cost?: { total?: number }
}): string {
  const inTok = usage.input ?? 0
  const outTok = usage.output ?? 0
  const parts = [`${inTok} 入 · ${outTok} 出`]
  if (usage.cost?.total != null && usage.cost.total > 0) {
    parts.push(`$${usage.cost.total.toFixed(4)}`)
  }
  return parts.join(" · ")
}

function toolStepId(toolCallId: string) {
  return `tool-${toolCallId}`
}

const TURN_STEP_ID = "turn"
const RESPOND_STEP_ID = "respond"

/** 回合开始后再追加步骤，避免顶部长期停在 loading */
export function createInitialAgentSteps(): AgentStep[] {
  return []
}

export function setStepStatus(
  steps: AgentStep[],
  id: string,
  status: AgentStepStatus,
  detail?: string
): AgentStep[] {
  return steps.map((s) =>
    s.id === id ? { ...s, status, detail: detail ?? s.detail } : s
  )
}

/** turn_start：模型规划 / 决定是否调工具 */
export function setTurnPlanning(steps: AgentStep[]): AgentStep[] {
  const hasTurn = steps.some((s) => s.id === TURN_STEP_ID)
  const next = hasTurn
    ? steps.map((s) =>
        s.id === TURN_STEP_ID
          ? {
              ...s,
              label: "调用模型",
              detail: "规划与工具决策",
              status: "active" as const,
            }
          : s
      )
    : [
        ...steps,
        {
          id: TURN_STEP_ID,
          label: "调用模型",
          detail: "规划与工具决策",
          status: "active" as const,
        },
      ]
  return next.filter((s) => s.id !== RESPOND_STEP_ID)
}

/** thinking_delta：模型在推理（非用户可见正文） */
export function setTurnThinking(steps: AgentStep[]): AgentStep[] {
  return steps.map((s) =>
    s.id === TURN_STEP_ID && s.status === "active"
      ? { ...s, detail: "推理中…" }
      : s
  )
}

/** 正文开始流式输出：结束当前活动步骤，正文区单独展示（不再挂「生成回复」loading） */
export function setTurnResponding(steps: AgentStep[]): AgentStep[] {
  return steps
    .map((s) => {
      if (s.status !== "active") return s
      if (s.id.startsWith("tool-")) return s
      return { ...s, status: "done" as const, detail: s.detail || "已完成" }
    })
    .filter((s) => s.id !== RESPOND_STEP_ID)
}

export function startToolStep(
  steps: AgentStep[],
  toolCallId: string,
  toolName: string,
  detail?: string
): AgentStep[] {
  const id = toolStepId(toolCallId)
  if (steps.some((s) => s.id === id)) {
    return updateToolStep(steps, toolCallId, detail ?? "执行中…")
  }
  const settled = steps.map((s) => {
    if (s.id === TURN_STEP_ID) {
      return { ...s, status: "done" as const, detail: "已派发工具" }
    }
    if (s.status === "active") return { ...s, status: "done" as const }
    return s
  })
  return [
    ...settled.filter((s) => s.id !== RESPOND_STEP_ID),
    {
      id,
      label: toolLabel(toolName),
      detail: detail ?? formatToolArgsSummary(toolName, {}),
      status: "active",
    },
  ]
}

export function updateToolStep(
  steps: AgentStep[],
  toolCallId: string,
  detail: string
): AgentStep[] {
  const id = toolStepId(toolCallId)
  return steps.map((s) => (s.id === id ? { ...s, detail } : s))
}

export function completeToolStep(
  steps: AgentStep[],
  toolCallId: string,
  toolName: string,
  detail: string,
  isError = false
): AgentStep[] {
  const id = toolStepId(toolCallId)
  let matched = false
  const updated = steps.map((s) => {
    if (s.id !== id) return s
    matched = true
    return {
      ...s,
      status: "done" as const,
      detail,
      variant: isError ? ("error" as const) : undefined,
    }
  })
  const base = matched
    ? updated
    : startToolStep(steps, toolCallId, toolName, detail).map((s) =>
        s.id === id
          ? {
              ...s,
              status: "done" as const,
              detail,
              variant: isError ? ("error" as const) : undefined,
            }
          : s
      )
  return base
}

export function setRetryStep(
  steps: AgentStep[],
  phase: "start" | "end",
  meta: {
    attempt: number
    maxAttempts: number
    errorMessage?: string
    success?: boolean
  }
): AgentStep[] {
  const id = "retry"
  if (phase === "start") {
    const settled = steps.map((s) =>
      s.status === "active" ? { ...s, status: "done" as const } : s
    )
    const err = meta.errorMessage?.trim()
    const detail = err
      ? `第 ${meta.attempt}/${meta.maxAttempts} 次 · ${truncateThinkingPreview(err, 80)}`
      : `第 ${meta.attempt}/${meta.maxAttempts} 次`
    return [
      ...settled.filter((s) => s.id !== id),
      { id, label: "重试模型请求", detail, status: "active" },
    ]
  }
  return steps.map((s) =>
    s.id === id
      ? {
          ...s,
          status: "done" as const,
          detail: meta.success ? "已恢复" : "仍失败",
          variant: meta.success ? undefined : ("error" as const),
        }
      : s
  )
}

const COMPACTION_REASON_LABEL: Record<string, string> = {
  manual: "手动",
  threshold: "上下文接近上限",
  overflow: "上下文溢出",
}

export function setCompactionStep(
  steps: AgentStep[],
  phase: "start" | "end",
  reason?: string
): AgentStep[] {
  const id = "compaction"
  const reasonLabel = reason
    ? (COMPACTION_REASON_LABEL[reason] ?? reason)
    : undefined
  if (phase === "start") {
    const settled = steps.map((s) =>
      s.status === "active" ? { ...s, status: "done" as const } : s
    )
    return [
      ...settled.filter((s) => s.id !== id),
      {
        id,
        label: "压缩对话上下文",
        detail: reasonLabel ? `${reasonLabel} · 生成摘要…` : "生成摘要…",
        status: "active",
      },
    ]
  }
  return steps.map((s) =>
    s.id === id
      ? {
          ...s,
          status: "done" as const,
          detail: reasonLabel ? `${reasonLabel} · 已完成` : "已完成",
        }
      : s
  )
}

export function markAllDone(steps: AgentStep[]): AgentStep[] {
  return steps.map((s) => ({ ...s, status: "done" as const }))
}

const THINK_OPEN = /<(?:think|redacted_reasoning|redacted_thinking)\s*>/gi
const THINK_CLOSE = /<\/(?:think|redacted_reasoning|redacted_thinking)\s*>/gi
const THINK_PAIRED =
  /<(?:think|redacted_reasoning|redacted_thinking)\s*>([\s\S]*?)<\/(?:think|redacted_reasoning|redacted_thinking)\s*>/gi

export type ParsedModelThinking = {
  thinking: string
  visible: string
  /** 流式输出中思考块尚未闭合 */
  inThinkBlock: boolean
}

/** 从模型输出中拆分思考块（Qwen3 / Thinking 版等） */
export function parseModelThinking(text: string): ParsedModelThinking {
  const raw = text ?? ""
  if (!raw.trim()) {
    return { thinking: "", visible: "", inThinkBlock: false }
  }

  const pairedParts: string[] = []
  let pairedLastEnd = 0
  const paired = new RegExp(THINK_PAIRED.source, THINK_PAIRED.flags)
  let m: RegExpExecArray | null
  while ((m = paired.exec(raw)) !== null) {
    pairedParts.push(m[1].trim())
    pairedLastEnd = m.index + m[0].length
  }
  if (pairedParts.length > 0) {
    return {
      thinking: pairedParts.join("\n\n"),
      visible: raw.slice(pairedLastEnd).replace(THINK_OPEN, "").trim(),
      inThinkBlock: false,
    }
  }

  const closeMatch = raw.match(
    /([\s\S]*?)<\/(?:think|redacted_reasoning|redacted_thinking)\s*>/i
  )
  if (closeMatch) {
    const thinking = closeMatch[1].replace(THINK_OPEN, "").trim()
    const visible = raw
      .slice(closeMatch.index! + closeMatch[0].length)
      .replace(THINK_OPEN, "")
      .trim()
    return { thinking, visible, inThinkBlock: false }
  }

  const openMatch = raw.match(THINK_OPEN)
  if (openMatch?.index != null) {
    const thinking = raw.slice(openMatch.index + openMatch[0].length).trim()
    const visible = raw.slice(0, openMatch.index).trim()
    return { thinking, visible, inThinkBlock: true }
  }

  return { thinking: "", visible: raw, inThinkBlock: false }
}

/** @deprecated 使用 parseModelThinking */
export function splitThinkTags(text: string): {
  thinking: string
  visible: string
} {
  const { thinking, visible } = parseModelThinking(text)
  return { thinking, visible }
}

export function truncateThinkingPreview(text: string, max = 160) {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** 当前 GGUF 是否可能输出可解析的思考块 */
export function modelMayEmitThinking(modelFileName: string | null | undefined) {
  if (!modelFileName) return false
  const n = modelFileName.toLowerCase()
  return (
    n.includes("qwen3") ||
    n.includes("thinking") ||
    n.includes("deepseek-r1") ||
    n.includes("r1-distill")
  )
}

/** 非 Qwen3 等模型：用 XML 思考块，便于流式展示推理过程 */
export function modelUsesXmlThinking(
  modelFileName: string | null | undefined
): boolean {
  if (!modelFileName || modelMayEmitThinking(modelFileName)) return false
  const n = modelFileName.toLowerCase()
  return (
    n.includes("qwen2.5") ||
    n.includes("qwen2") ||
    n.includes("llama") ||
    n.includes("mistral") ||
    n.includes("gemma")
  )
}

export function getThinkingSystemAddon(
  modelFileName: string | null | undefined
): string {
  if (modelMayEmitThinking(modelFileName)) return ""
  if (!modelUsesXmlThinking(modelFileName)) return ""
  const thinkOpen = "<" + "think" + ">"
  const thinkClose = "</" + "think" + ">"
  return (
    "\n\n回答前请先在 " +
    thinkOpen +
    " 标签内写出简要推理（用户可见），闭合 " +
    thinkClose +
    " 后再写面向用户的正文。"
  )
}

/** 合并主进程 thought 段与 answer 内嵌思考标签 */
export function mergeStreamThinking(
  nativeThinking: string,
  rawAnswer: string
): ParsedModelThinking {
  const parsed = parseModelThinking(rawAnswer)
  const thinking = [nativeThinking.trim(), parsed.thinking.trim()]
    .filter(Boolean)
    .join("\n\n")
  const visible = parsed.inThinkBlock ? parsed.visible : parsed.visible || rawAnswer
  return {
    thinking,
    visible,
    inThinkBlock: parsed.inThinkBlock,
  }
}

/** Qwen3：/think；其它 Instruct 靠 system 中的 XML 说明 */
export function appendModelReplyHints(
  userContent: string,
  modelFileName: string | null | undefined
) {
  if (!modelMayEmitThinking(modelFileName)) return userContent
  if (/\/think\b/i.test(userContent)) return userContent
  return `${userContent}\n\n/think`
}

/** @deprecated 使用 appendModelReplyHints */
export function appendThinkModeHint(
  userContent: string,
  modelFileName: string | null | undefined
) {
  return appendModelReplyHints(userContent, modelFileName)
}
