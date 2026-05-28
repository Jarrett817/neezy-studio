import { getElectronApi } from "./electron-client"

export type AgentEventPayload = {
  sessionId: string
  event: {
    type: string
    [key: string]: unknown
  }
}

export async function createAgentSession(): Promise<string> {
  return getElectronApi().invoke<string>("agent:create", null)
}

export async function configureAgentSession(
  sessionId: string,
  config: {
    systemPrompt: string
    messages?: { role: "user" | "assistant"; content: string }[]
  }
): Promise<{ ok: boolean }> {
  return getElectronApi().invoke("agent:configure", {
    sessionId,
    ...config,
  })
}

export async function promptAgent(
  sessionId: string,
  message: string
): Promise<{ ok: boolean }> {
  return getElectronApi().invoke("agent:prompt", { sessionId, message })
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
  return getElectronApi().on("agent:event", (event: unknown, payload: AgentEventPayload) => {
    callback(payload)
  })
}
