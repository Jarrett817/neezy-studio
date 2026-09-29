import { lazy, Suspense, useCallback, useEffect, useState } from "react"
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

const AgentPermissionDialogView = lazy(() => import("./agent-permission-dialog-view"))

async function respondPermission(
  sessionId: string,
  requestId: string,
  payload: { action?: PermissionDialogAction; value?: string }
) {
  await getElectronApi().invoke("agent:permission-respond", {
    sessionId,
    requestId,
    ...payload,
  })
}

export function useAgentPermissionDialog(activeSessionId: string | null) {
  const [prompt, setPrompt] = useState<AgentPermissionPrompt | null>(null)

  const dismiss = useCallback(
    async (payload: { action?: PermissionDialogAction; value?: string }) => {
      if (!prompt) return
      const current = prompt
      setPrompt(null)
      await respondPermission(current.sessionId, current.requestId, payload)
    },
    [prompt]
  )

  useEffect(() => {
    return getElectronApi().on(
      "agent:permission-prompt",
      (_event: unknown, payload: AgentPermissionPrompt) => {
        if (!activeSessionId || payload.sessionId !== activeSessionId) return
        setPrompt(payload)
      }
    )
  }, [activeSessionId])

  useEffect(() => {
    return getElectronApi().on(
      "agent:permission-notify",
      (
        _event: unknown,
        payload: { sessionId: string; message: string; type?: string }
      ) => {
        if (!activeSessionId || payload.sessionId !== activeSessionId) return
        const fn =
          payload.type === "error"
            ? toast.error
            : payload.type === "warning"
              ? toast.warning
              : toast.info
        fn(payload.message)
      }
    )
  }, [activeSessionId])

  return prompt ? (
    <Suspense fallback={null}>
      <AgentPermissionDialogView prompt={prompt} onDismiss={dismiss} />
    </Suspense>
  ) : null
}
