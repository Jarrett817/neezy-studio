import { lazy, Suspense, useEffect, useState } from "react"
import { toast } from "sonner"

import { getElectronApi } from "~/services/electron-client"

export type PermissionDialogAction =
  | "allow-once"
  | "allow-always"
  | "deny"
  | "deny-reason"

export interface AgentPermissionPrompt {
  sessionId: string
  requestId: string
  kind: "select" | "input" | "permission" | "confirm"
  title: string
  options?: string[]
  placeholder?: string
  grantTarget?: unknown
}

const AgentPermissionDialogView = lazy(
  () => import("./agent-permission-dialog-view")
)

async function respondPermission(
  sessionId: string,
  requestId: string,
  payload: { action?: PermissionDialogAction; value?: string }
) {
  await getElectronApi().agentPermissionRespond({
    sessionId,
    requestId,
    ...payload,
  })
}

export function useAgentPermissionDialog(activeSessionId: string | null) {
  const [prompt, setPrompt] = useState<AgentPermissionPrompt | null>(null)

  const dismiss = async (payload: {
    action?: PermissionDialogAction
    value?: string
  }) => {
    if (!prompt) return
    const current = prompt
    setPrompt(null)
    await respondPermission(current.sessionId, current.requestId, payload)
  }

  useEffect(() => {
    return getElectronApi().onAgentPermissionPrompt((payload) => {
      const p = payload as AgentPermissionPrompt
      if (!activeSessionId || p.sessionId !== activeSessionId) return
      setPrompt(p)
    })
  }, [activeSessionId])

  useEffect(() => {
    return getElectronApi().onAgentPermissionNotify((payload) => {
      const p = payload as {
        sessionId: string
        message: string
        type?: string
      }
      if (!activeSessionId || p.sessionId !== activeSessionId) return
      const fn =
        p.type === "error"
          ? toast.error
          : p.type === "warning"
            ? toast.warning
            : toast.info
      fn(p.message)
    })
  }, [activeSessionId])

  return prompt ? (
    <Suspense fallback={null}>
      <AgentPermissionDialogView prompt={prompt} onDismiss={dismiss} />
    </Suspense>
  ) : null
}
