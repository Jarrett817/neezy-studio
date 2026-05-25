export type AgentStepStatus = "pending" | "active" | "done"

export type AgentStep = {
  id: string
  label: string
  detail?: string
  status: AgentStepStatus
}

export const TOOL_LABELS: Record<string, string> = {
  memory_search: "查阅记忆",
  memory_add: "写入记忆",
  memory_event: "记录片段",
  datetime: "确认时间",
  calculator: "演算",
}

export function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? "处理信息"
}

export function createInitialAgentSteps(): AgentStep[] {
  return [
    { id: "understand", label: "理解你的问题", status: "active" },
    { id: "think", label: "整理思路", status: "pending" },
    { id: "reply", label: "组织回答", status: "pending" },
  ]
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

export function advanceToThink(steps: AgentStep[]): AgentStep[] {
  return steps.map((s) => {
    if (s.id === "understand") return { ...s, status: "done" as const }
    if (s.id === "think") return { ...s, status: "active" as const }
    return s
  })
}

export function advanceToReply(steps: AgentStep[]): AgentStep[] {
  return steps.map((s) => {
    if (s.id === "understand" || s.id === "think")
      return { ...s, status: "done" as const }
    if (s.id === "reply") return { ...s, status: "active" as const }
    return s
  })
}

export function addToolStep(steps: AgentStep[], toolName: string): AgentStep[] {
  const id = `tool-${toolName}-${Date.now()}`
  const done = steps.map((s) =>
    s.status === "active" ? { ...s, status: "done" as const } : s
  )
  return [
    ...done,
    {
      id,
      label: toolLabel(toolName),
      detail: "已完成",
      status: "done",
    },
    { id: "think", label: "继续推理", status: "active" },
    { id: "reply", label: "组织回答", status: "pending" },
  ]
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
