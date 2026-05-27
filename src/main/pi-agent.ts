import { Agent } from "@earendil-works/pi-agent-core"
import type { AgentEvent } from "@earendil-works/pi-agent-core"
import { getToolRegistry } from "./pi-tool-registry"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"
import fsSync from "node:fs"
import path from "node:path"
import { app } from "electron"

interface Session {
  agent: Agent
  unsubscribe: () => void
  window: BrowserWindow
}

const sessions = new Map<string, Session>()

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json")
}

interface RuntimeSettings {
  preferLowPower: boolean
  maxCpuPercent: number
  llmModel: string
  embeddingModel: string
  chatTier: string
  embeddingTier: string
  ollamaHost?: string
}

async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settingsPath = getSettingsPath()
  try {
    if (fsSync.existsSync(settingsPath)) {
      const content = fsSync.readFileSync(settingsPath, "utf-8")
      return JSON.parse(content) as RuntimeSettings
    }
  } catch {
    // fall through
  }
  return { preferLowPower: true, maxCpuPercent: 95, llmModel: "", embeddingModel: "", chatTier: "", embeddingTier: "" }
}

export async function createAgentSession(window: BrowserWindow): Promise<string> {
  const sessionId = randomUUID()
  const settings = await getRuntimeSettings()
  const tools = getToolRegistry()

  // pi-ai requires a Model object; use openai-responses API with Ollama baseUrl
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ollamaModel = {
    id: settings.llmModel || "qwen2.5:7b",
    name: settings.llmModel || "qwen2.5:7b",
    api: "openai-responses" as const,
    provider: "ollama",
    baseUrl: (settings.ollamaHost || "http://localhost:11434") + "/v1",
    reasoning: false,
    input: ["text"] as string[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 8192,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = new Agent({
    initialState: {
      tools,
      model: ollamaModel as any,
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