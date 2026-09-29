import type { Agent } from "@earendil-works/pi-agent-core"
import type { Api, Model } from "@earendil-works/pi-ai"
import type { AgentSession } from "@earendil-works/pi-coding-agent"

const MIN_DECLARED_MAX_TOKENS = 1
/** pi-ai 仅留 4096；网关 tokenizer 常大于 chars/4，再留余量避免 input + max_tokens 超窗 */
const MAX_TOKENS_SAFETY = 12_288
const ESTIMATED_IMAGE_CHARS = 4800

const clampedAgents = new WeakSet<Agent>()

function contentChars(content: unknown): number {
  if (typeof content === "string") return content.length
  if (!Array.isArray(content)) return 0
  let chars = 0
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const b = block as Record<string, unknown>
    if (b.type === "text" && typeof b.text === "string") chars += b.text.length
    else if (b.type === "image") chars += ESTIMATED_IMAGE_CHARS
    else if (typeof b.content === "string") chars += b.content.length
  }
  return chars
}

function estimatePayloadInputTokens(messages: unknown, tools: unknown): number {
  let chars = 0
  if (Array.isArray(messages)) {
    for (const raw of messages) {
      if (!raw || typeof raw !== "object") continue
      const m = raw as Record<string, unknown>
      chars += contentChars(m.content)
      if (m.tool_calls !== undefined) chars += JSON.stringify(m.tool_calls).length
      if (typeof m.name === "string") chars += m.name.length
    }
  }
  if (Array.isArray(tools) && tools.length > 0) {
    chars += JSON.stringify(tools).length
  }
  return Math.ceil(chars / 4)
}

function maxTokensField(model: Model<Api>): "max_tokens" | "max_completion_tokens" {
  const compat = model.compat
  if (
    compat &&
    typeof compat === "object" &&
    "maxTokensField" in compat &&
    compat.maxTokensField === "max_completion_tokens"
  ) {
    return "max_completion_tokens"
  }
  return "max_tokens"
}

/** 按 contextWindow − 估算 input − 安全边距 钳制 OpenAI 兼容请求里的 max_tokens */
export function clampOpenAiCompatMaxTokensInPayload(
  payload: unknown,
  model: Model<Api>
): unknown {
  if (!payload || typeof payload !== "object") return payload
  const contextWindow = model.contextWindow
  if (!(contextWindow > 0)) return payload

  const record = payload as Record<string, unknown>
  const field = maxTokensField(model)
  const current = record[field]
  if (typeof current !== "number" || !Number.isFinite(current)) return payload

  const estimate = estimatePayloadInputTokens(record.messages, record.tools)
  const available = contextWindow - estimate - MAX_TOKENS_SAFETY
  const capped = Math.min(current, Math.max(MIN_DECLARED_MAX_TOKENS, available))
  if (capped === current) return payload
  return { ...record, [field]: Math.floor(capped) }
}

export function applyRequestMaxTokensClamp(session: AgentSession): void {
  const agent = session.agent
  if (clampedAgents.has(agent)) return
  clampedAgents.add(agent)

  const prev = agent.onPayload
  agent.onPayload = async (payload, model) => {
    let next = prev ? ((await prev(payload, model)) ?? payload) : payload
    if (model.api === "openai-completions") {
      next = clampOpenAiCompatMaxTokensInPayload(next, model)
    }
    return next
  }
}
