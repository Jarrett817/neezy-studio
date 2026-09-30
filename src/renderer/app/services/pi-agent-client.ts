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
  return getElectronApi().agentCreate(options)
}

export async function agentSessionExists(sessionId: string): Promise<boolean> {
  return getElectronApi().agentExists(sessionId)
}

export async function promptAgent(
  sessionId: string,
  message: string,
  images?: ImageContent[]
): Promise<{ ok: boolean }> {
  return getElectronApi().agentPrompt({ sessionId, message, images })
}

export async function getAgentContextUsage(
  sessionId: string
): Promise<ContextUsageWire | null> {
  return getElectronApi().agentContextUsage(sessionId)
}

export async function listAgentSkillCommands(
  sessionId: string
): Promise<Array<{ name: string; description: string }>> {
  return getElectronApi().agentSkillCommands(sessionId)
}

export async function abortAgentSession(
  sessionId: string
): Promise<{ ok: boolean }> {
  return getElectronApi().agentAbort(sessionId)
}

export async function destroyAgentSession(
  sessionId: string
): Promise<{ ok: boolean }> {
  return getElectronApi().agentDestroy(sessionId)
}

export function subscribeAgentEvents(
  callback: (payload: AgentEventPayload) => void
): () => void {
  return getElectronApi().onAgentEvent((payload) => {
    callback(payload as AgentEventPayload)
  })
}
