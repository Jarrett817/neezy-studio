import type { ContextUsageWire } from "../../../shared/chat-wire"
import type { AgentSessionEvent, ImageContent } from "../../../shared/pi-sdk"
import { getElectronApi } from "./electron-client"

export type AgentEventPayload = {
  sessionId: string
  event: AgentSessionEvent
}

export interface CreateAgentSessionOptions {
  diskSessionId?: string
  createNew?: boolean
}

export async function createAgentSession(
  options: CreateAgentSessionOptions = {}
): Promise<string> {
  return getElectronApi().invoke<string>("agent:create", options)
}

export async function configureAgentSession(
  sessionId: string,
  config: { systemPrompt: string }
): Promise<{ ok: boolean }> {
  return getElectronApi().invoke("agent:configure", {
    sessionId,
    ...config,
  })
}

export async function promptAgent(
  sessionId: string,
  message: string,
  images?: ImageContent[]
): Promise<{ ok: boolean }> {
  return getElectronApi().invoke("agent:prompt", { sessionId, message, images })
}

export async function getAgentContextUsage(
  sessionId: string
): Promise<ContextUsageWire | null> {
  return getElectronApi().invoke("agent:context-usage", { sessionId })
}

export async function listAgentSkillCommands(
  sessionId: string
): Promise<Array<{ name: string; description: string }>> {
  return getElectronApi().invoke("agent:skill-commands", { sessionId })
}

export async function abortAgentSession(sessionId: string): Promise<{ ok: boolean }> {
  return getElectronApi().invoke("agent:abort", { sessionId })
}

export async function destroyAgentSession(
  sessionId: string
): Promise<{ ok: boolean }> {
  return getElectronApi().invoke("agent:destroy", { sessionId })
}

export function subscribeAgentEvents(
  callback: (payload: AgentEventPayload) => void
): () => void {
  return getElectronApi().on("agent:event", (_event: unknown, payload: AgentEventPayload) => {
    callback(payload)
  })
}
