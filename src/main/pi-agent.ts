import { Agent } from "@earendil-works/pi-agent-core"
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

import { resolvePiChatModel } from "./pi-model"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import { getToolRegistry } from "./pi-tool-registry"

interface Session {
  agent: Agent
  unsubscribe: () => void
  window: BrowserWindow
}

const sessions = new Map<string, Session>()

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

function createAgent(window: BrowserWindow): Agent {
  const settings = getSyncedRuntimeSettings()
  const agent = new Agent({
    initialState: {
      systemPrompt: "",
      model: resolvePiChatModel(),
      tools: getToolRegistry(),
      messages: [],
    },
    toolExecution: "sequential",
    getApiKey: (provider) => {
      const p = getSyncedRuntimeSettings().llmProvider
      if (p.kind === "openai-compatible") return p.apiKey.trim() || undefined
      if (provider === "ollama") return "ollama"
      return undefined
    },
  })
  void settings
  return agent
}

export async function createAgentSession(window: BrowserWindow): Promise<string> {
  const sessionId = randomUUID()
  const agent = createAgent(window)
  const unsubscribe = await agent.subscribe(async (event: AgentEvent) => {
    window.webContents.send("agent:event", { sessionId, event })
  })
  sessions.set(sessionId, { agent, unsubscribe, window })
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
  session.agent.state.model = resolvePiChatModel()
  if (config.messages) {
    session.agent.state.messages = config.messages.map(toAgentMessage)
  }
}

export async function promptAgent(sessionId: string, message: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error("session not found")
  session.agent.state.model = resolvePiChatModel()
  await session.agent.prompt(message)
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
