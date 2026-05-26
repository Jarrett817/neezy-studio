import { Agent } from "@earendil-works/pi-agent-core"
import type { AgentEvent } from "@earendil-works/pi-agent-core"
import type { Model } from "@earendil-works/pi-ai"
import { getToolRegistry } from "./pi-tool-registry"
import { getRuntimeSettings } from "~/services/settings"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

interface Session {
  agent: Agent
  unsubscribe: () => void
  window: BrowserWindow
}

const sessions = new Map<string, Session>()

export async function createAgentSession(window: BrowserWindow): Promise<string> {
  const sessionId = randomUUID()
  const settings = await getRuntimeSettings()
  const tools = getToolRegistry()

  // Create a Model directly for Ollama (OpenAI-compatible endpoint)
  // pi-ai's getModel() doesn't support Ollama provider, so we construct the model manually
  const ollamaModel: Model<"openai-responses"> = {
    id: settings.llmModel,
    name: settings.llmModel,
    api: "openai-responses",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 8192,
  }

  const agent = new Agent({
    initialState: {
      tools,
      model: ollamaModel,
    },
    toolExecution: "sequential",
  })

  const unsubscribe = await agent.subscribe(async (event: AgentEvent) => {
    window.webContents.send("agent:event", { sessionId, event })
  })

  sessions.set(sessionId, { agent, unsubscribe, window })
  return sessionId
}

export async function promptAgent(sessionId: string, message: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error("session not found")
  await session.agent.prompt(message)
}

export async function destroyAgentSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  await session.unsubscribe()
  sessions.delete(sessionId)
}

export function agentSessionExists(sessionId: string): boolean {
  return sessions.has(sessionId)
}