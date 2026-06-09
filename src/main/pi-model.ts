import {

  getModel,

  getModels,

  getProviders,

  type Api,

  type AssistantMessage,

  type AssistantMessageEvent,

  type AssistantMessageEventStream,

  type KnownProvider,

  type Model,

} from "@earendil-works/pi-ai"

import type { Agent, StreamFn } from "@earendil-works/pi-agent-core"

import type { AgentSession } from "@earendil-works/pi-coding-agent"



import {

  inferChatApiKind,

  resolveChatApiBaseUrl,

  resolvePiProvider,

  type ChatApiKind,

} from "../shared/chat-api-route"

import {

  dashScopeModelUsesThinking,

  dashScopeThinkingFormat,

  isDashScopeOpenAiBaseUrl,

} from "../shared/coding-plan-catalog"

import { resolveEntryApiBase } from "./chat-model-entry"

import { resolveActiveChatRoute } from "./model-routing"

import { getSyncedRuntimeSettings } from "./runtime-settings"



const EMPTY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const dashScopeFixedAgents = new WeakSet<Agent>()



function resolveEntryBaseUrl(

  entry: NonNullable<ReturnType<typeof resolveActiveChatRoute>["entry"]>

): string {

  const settings = getSyncedRuntimeSettings()

  return resolveEntryApiBase(entry, settings.llmProvider)

}



function isKnownProvider(provider: string): provider is KnownProvider {

  return (getProviders() as readonly string[]).includes(provider)

}



function findPiCatalogModel(provider: KnownProvider, modelId: string): Model<Api> | undefined {

  const direct = getModel(provider, modelId as never)

  if (direct) return direct as Model<Api>



  const needle = modelId.trim().toLowerCase()

  return getModels(provider).find((m) => m.id.toLowerCase() === needle) as Model<Api> | undefined

}



function fallbackAnthropicTemplate(provider: KnownProvider): Model<Api> | undefined {

  if (provider === "minimax-cn") {

    return getModel("minimax-cn", "MiniMax-M2.7") as Model<Api> | undefined

  }

  return getModels(provider).find((m) => m.api === "anthropic-messages") as Model<Api> | undefined

}



function buildApiModel(

  modelId: string,

  apiKind: ChatApiKind,

  baseUrl: string,

  provider: string,

  reasoning: boolean,

  compat?: Record<string, unknown>

): Model<Api> {

  return {

    id: modelId,

    name: modelId,

    api: apiKind,

    provider,

    baseUrl,

    reasoning,

    input: ["text"],

    cost: EMPTY_COST,

    contextWindow: 204_800,

    maxTokens: 131_072,

    ...(compat ? { compat } : {}),

  } as Model<Api>

}



function buildDashScopeCompat(): Record<string, unknown> {

  return {

    maxTokensField: "max_tokens" as const,

    supportsStore: false,

    supportsDeveloperRole: false,

    supportsReasoningEffort: false,

    // 百炼末包可能仅含 usage、无 finish_reason

    supportsUsageInStreaming: false,

    thinkingFormat: dashScopeThinkingFormat(),

  }

}



/** 无论模型来源（catalog / 自建），百炼 OpenAI 兼容端点统一补齐 compat */

function withDashScopeCompat(model: Model<Api>, modelId: string, baseUrl: string): Model<Api> {

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



/** 从统一模型条目解析 pi-ai Model（优先使用 pi-ai 内置目录） */

export function resolvePiChatModel(_userMessage?: string): Model<Api> {

  const settings = getSyncedRuntimeSettings()

  const route = resolveActiveChatRoute()

  const entry = route.entry

  const modelId = route.modelId

  if (!entry || !modelId) {

    throw new Error("请先在「模型与连接」配置 API 对话模型")

  }



  const base = resolveEntryBaseUrl(entry)

  const apiKind = inferChatApiKind(base)

  const baseUrl = resolveChatApiBaseUrl(base, apiKind)

  const preset = entry.preset?.trim() || settings.llmProvider.preset || "custom"

  const provider = resolvePiProvider(preset, apiKind, base)



  if (isKnownProvider(provider)) {

    const catalog =

      findPiCatalogModel(provider, modelId) ?? fallbackAnthropicTemplate(provider)

    if (catalog) {

      return withDashScopeCompat(

        { ...catalog, id: modelId, name: modelId, baseUrl },

        modelId,

        baseUrl

      )

    }

  }



  const reasoning =

    apiKind === "anthropic-messages" && provider === "minimax-cn"

      ? true

      : isDashScopeOpenAiBaseUrl(baseUrl) && dashScopeModelUsesThinking(modelId)



  const dashScopeCompat = isDashScopeOpenAiBaseUrl(baseUrl) ? buildDashScopeCompat() : undefined



  return withDashScopeCompat(

    buildApiModel(modelId, apiKind, baseUrl, provider, reasoning, dashScopeCompat),

    modelId,

    baseUrl

  )

}



/**

 * 百炼 Agent 工具流式易缺 finish_reason；默认关闭 thinking 并显式 enable_thinking=false。

 */

export function resolveAgentThinkingLevel(model: Model<Api>): "off" | "medium" {

  if (isDashScopeOpenAiBaseUrl(model.baseUrl ?? "") && dashScopeModelUsesThinking(model.id)) {

    return "off"

  }

  return model.reasoning ? "medium" : "off"

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



function salvageDashScopeMissingFinishReason(message: AssistantMessage): AssistantMessage {

  if (!isDashScopeFinishReasonError(message)) return message

  // 百炼常在末包只回 usage；前面 delta 已写入 content

  if (!hasAssistantStreamContent(message)) {

    return { ...message, stopReason: "stop", errorMessage: undefined }

  }

  return { ...message, stopReason: "stop", errorMessage: undefined }

}



function wrapDashScopeEventStream(stream: AssistantMessageEventStream): AssistantMessageEventStream {

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

  return next

}



function wrapDashScopeStreamFn(base: StreamFn, getThinkingOn: () => boolean): StreamFn {

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

            return patchDashScopeRequestPayload(next, m, getThinkingOn())

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

  agent.streamFn = wrapDashScopeStreamFn(baseStreamFn, () => agent.state.thinkingLevel !== "off")



  const prevPayload = agent.onPayload

  agent.onPayload = async (payload, model) => {

    let next = prevPayload ? ((await prevPayload(payload, model)) ?? payload) : payload

    if (isDashScopeOpenAiBaseUrl(model.baseUrl ?? "")) {

      next = patchDashScopeRequestPayload(next, model, agent.state.thinkingLevel !== "off")

    }

    return next

  }

}


