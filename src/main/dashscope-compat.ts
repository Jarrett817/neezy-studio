import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Model,
} from "@earendil-works/pi-ai"
import type { Agent, StreamFn } from "@earendil-works/pi-agent-core"
import type { AgentSession } from "@earendil-works/pi-coding-agent"
import {
  dashScopeModelUsesThinking,
  dashScopeThinkingFormat,
  isDashScopeOpenAiBaseUrl,
} from "../shared/coding-plan-catalog"

const dashScopeFixedAgents = new WeakSet<Agent>()

function buildDashScopeCompat(): Record<string, unknown> {
  return {
    maxTokensField: "max_tokens" as const,
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    // 百炼末包可能仅含 usage、无 finish_reason
    supportsUsageInStreaming: false,
    supportsFinishReason: false,
    thinkingFormat: dashScopeThinkingFormat(),
  }
}

/** 无论模型来源（catalog / 自建），百炼 OpenAI 兼容端点统一补齐 compat */
export function withDashScopeCompat(
  model: Model<Api>,
  modelId: string,
  baseUrl: string
): Model<Api> {
  if (!isDashScopeOpenAiBaseUrl(baseUrl)) return model

  const reasoning = dashScopeModelUsesThinking(modelId) || model.reasoning

  return {
    ...model,
    id: modelId,
    name: modelId,
    baseUrl,
    reasoning,
    compat: {
      ...(model.compat ?? {}),
      ...buildDashScopeCompat(),
    },
  } as Model<Api>
}

function isDashScopeFinishReasonError(message: AssistantMessage): boolean {
  return (
    message.stopReason === "error" &&
    typeof message.errorMessage === "string" &&
    message.errorMessage.includes("finish_reason")
  )
}

function hasAssistantStreamContent(message: AssistantMessage): boolean {
  return message.content.some((block) => {
    if (block.type === "text") return block.text.trim().length > 0
    if (block.type === "thinking") return block.thinking.trim().length > 0
    if (block.type === "toolCall") {
      return block.name.trim().length > 0 || Object.keys(block.arguments ?? {}).length > 0
    }
    return false
  })
}

function salvageDashScopeMissingFinishReason(
  message: AssistantMessage
): AssistantMessage {
  if (!isDashScopeFinishReasonError(message)) return message
  // 百炼常在末包只回 usage；前面 delta 已写入 content
  if (!hasAssistantStreamContent(message)) {
    return { ...message, stopReason: "stop", errorMessage: undefined }
  }
  return { ...message, stopReason: "stop", errorMessage: undefined }
}

function wrapDashScopeEventStream(
  stream: AssistantMessageEventStream
): AssistantMessageEventStream {
  const originalResult = stream.result.bind(stream)
  stream.result = () => originalResult().then(salvageDashScopeMissingFinishReason)

  const originalIterator = stream[Symbol.asyncIterator].bind(stream)
  stream[Symbol.asyncIterator] = function dashScopeStreamIterator() {
    const inner = originalIterator()
    return {
      async next() {
        const step = await inner.next()
        if (step.done || !step.value) return step
        const event = step.value as AssistantMessageEvent
        if (event.type === "error") {
          const salvaged = salvageDashScopeMissingFinishReason(event.error)
          if (salvaged.stopReason !== "error") {
            return {
              value: { type: "done", reason: salvaged.stopReason, message: salvaged },
              done: false,
            }
          }
        }
        return step
      },
      async return(value?: unknown) {
        return inner.return?.(value) ?? { value: undefined, done: true }
      },
      async throw(err?: unknown) {
        if (inner.throw) return inner.throw(err)
        throw err
      },
      [Symbol.asyncIterator]() {
        return this
      },
    }
  }

  return stream
}

function patchDashScopeRequestPayload(
  payload: unknown,
  model: Model<Api>,
  thinkingOn: boolean
): unknown {
  if (!payload || typeof payload !== "object") return payload
  const next = { ...(payload as Record<string, unknown>) }
  delete next.stream_options
  if (dashScopeModelUsesThinking(model.id)) {
    delete next.chat_template_kwargs
    next.enable_thinking = thinkingOn
  }
  // 百炼要求 user message 纯文本时 content 必须是 string，不能是 array
  if (Array.isArray(next.messages)) {
    const normalized = (next.messages as Array<Record<string, unknown>>).map((m) => {
      if ((m.role === "user" || m.role === "tool") && Array.isArray(m.content)) {
        const blocks = m.content as Array<Record<string, unknown>>
        const allText = blocks.every((b) => b && b.type === "text")
        if (allText) {
          return { ...m, content: blocks.map((b) => String(b.text ?? "")).join("") }
        }
      }
      return m
    })

    // 百炼要求 user/assistant 交替——合并连续的同 role 消息（仅对 user 做合并）
    const merged: Array<Record<string, unknown>> = []
    for (const m of normalized) {
      const last = merged[merged.length - 1]
      if (
        last &&
        last.role === "user" &&
        m.role === "user" &&
        typeof last.content === "string" &&
        typeof m.content === "string"
      ) {
        last.content = `${last.content}\n\n${m.content}`
      } else {
        merged.push({ ...m })
      }
    }
    next.messages = merged
  }
  return next
}

function wrapDashScopeStreamFn(
  base: StreamFn,
  getThinkingOn: () => boolean
): StreamFn {
  return async (model, context, options) => {
    const isDashScope = isDashScopeOpenAiBaseUrl(model.baseUrl ?? "")
    const mergedOptions = isDashScope
      ? {
          ...options,
          onPayload: async (payload: unknown, m: Model<Api>) => {
            let next = payload
            if (options?.onPayload) {
              const patched = await options.onPayload(payload, m)
              if (patched !== undefined) next = patched
            }
            const final = patchDashScopeRequestPayload(next, m, getThinkingOn())
            return final
          },
          onResponse: async (
            response: { status: number; headers: Record<string, string> },
            m: Model<Api>
          ) => {
            if (options?.onResponse) await options.onResponse(response, m)
          },
        }
      : options
    const stream = await base(model, context, mergedOptions)
    return isDashScope ? wrapDashScopeEventStream(stream) : stream
  }
}

/** 百炼 OpenAI 兼容：修正请求体并容忍末包缺失 finish_reason */
export function applyDashScopeAgentFixes(session: AgentSession): void {
  const agent = session.agent
  if (dashScopeFixedAgents.has(agent)) return
  dashScopeFixedAgents.add(agent)

  const baseStreamFn = agent.streamFn
  agent.streamFn = wrapDashScopeStreamFn(
    baseStreamFn,
    () => agent.state.thinkingLevel !== "off"
  )

  const prevPayload = agent.onPayload
  agent.onPayload = async (payload, model) => {
    let next = prevPayload ? ((await prevPayload(payload, model)) ?? payload) : payload
    if (isDashScopeOpenAiBaseUrl(model.baseUrl ?? "")) {
      next = patchDashScopeRequestPayload(
        next,
        model,
        agent.state.thinkingLevel !== "off"
      )
    }
    return next
  }
}

export { buildDashScopeCompat }
