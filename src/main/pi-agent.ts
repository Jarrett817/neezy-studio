import { Agent } from "@earendil-works/pi-agent-core"
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

import { ensureOllamaReady } from "./ollama/lifecycle"
import { normalizeMainChatModels, resolveEntryApiKey } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import { resolveRouteApiKey } from "./pi-llm"
import { resolveAgentThinkingLevel, resolvePiChatModel } from "./pi-model"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import { getToolRegistry } from "./pi-tool-registry"
import { log } from "./logger"

interface Session {
  agent: Agent
  unsubscribe: () => void
  window: BrowserWindow
  /** 当前路由 API Key，供 Agent.getApiKey 使用（与 pi-agent-core 文档一致） */
  apiKeyRef: { value: string | undefined }
}

const sessions = new Map<string, Session>()

function syncSessionChatRoute(session: Session, userMessage?: string): void {
  const model = resolvePiChatModel(userMessage)
  session.agent.state.model = model
  session.agent.state.thinkingLevel = resolveAgentThinkingLevel(model)
  session.apiKeyRef.value = resolveRouteApiKey(userMessage)
}

function toAgentMessage(m: {
  role: "user" | "assistant"
  content: string
}): AgentMessage {
  if (m.role === "user") {
    return { role: "user", content: m.content, timestamp: Date.now() }
  }
  const model = resolvePiChatModel()
  return {
    role: "assistant",
    content: [{ type: "text", text: m.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  }
}

function createAgent(apiKeyRef: Session["apiKeyRef"]): Agent {
  const model = resolvePiChatModel()
  return new Agent({
    initialState: {
      systemPrompt: "",
      model,
      thinkingLevel: resolveAgentThinkingLevel(model),
      tools: getToolRegistry(),
      messages: [],
    },
    toolExecution: "sequential",
    getApiKey: () => apiKeyRef.value,
  })
}

export async function createAgentSession(window: BrowserWindow): Promise<string> {
  const sessionId = randomUUID()
  const apiKeyRef: Session["apiKeyRef"] = { value: undefined }
  const agent = createAgent(apiKeyRef)
  syncSessionChatRoute({ agent, unsubscribe: () => {}, window, apiKeyRef })
  const unsubscribe = await agent.subscribe((event: AgentEvent) => {
    window.webContents.send("agent:event", { sessionId, event })
  })
  sessions.set(sessionId, { agent, unsubscribe, window, apiKeyRef })
  return sessionId
}

export function configureAgentSession(
  sessionId: string,
  config: {
    systemPrompt: string
    messages?: { role: "user" | "assistant"; content: string }[]
  }
): void {
  const session = sessions.get(sessionId)
  if (!session) throw new Error("session not found")
  session.agent.state.systemPrompt = config.systemPrompt
  syncSessionChatRoute(session)
  if (config.messages) {
    session.agent.state.messages = config.messages.map(toAgentMessage)
  }
}

async function ensureAgentChatReady(userMessage?: string): Promise<void> {
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute(userMessage)
  if (!route.entry?.model.trim()) {
    const configured = normalizeMainChatModels(settings).length
    if (configured > 0) {
      throw new Error(
        "当前消息档位下没有可用模型。请在「模型与连接」为各档位添加模型，或改为固定档位。"
      )
    }
    throw new Error("请先在「模型与连接」添加至少一个已启用的对话模型")
  }
  if (route.entry.transport === "openai-compatible") {
    const key = resolveEntryApiKey(route.entry, settings.llmProvider)
    if (!key) {
      throw new Error("该 API 模型未配置 Key，请在模型卡片或 API 默认项中填写")
    }
    return
  }
  await ensureOllamaReady()
}

export async function promptAgent(sessionId: string, message: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error("session not found")
  await ensureAgentChatReady(message)
  syncSessionChatRoute(session, message)
  const model = session.agent.state.model
  log.info(
    "[pi-agent] prompt",
    model.provider,
    model.id,
    model.api,
    model.baseUrl
  )
  try {
    await session.agent.prompt(message)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error("[pi-agent] prompt failed:", msg)
    throw new Error(msg)
  }
}

export function abortAgentSession(sessionId: string): void {
  sessions.get(sessionId)?.agent.abort()
}

export async function destroyAgentSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  session.agent.abort()
  await session.unsubscribe()
  sessions.delete(sessionId)
}

export function agentSessionExists(sessionId: string): boolean {
  return sessions.has(sessionId)
}
