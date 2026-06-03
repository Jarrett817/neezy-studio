import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { getElectronApi } from "~/services/electron-client"

export type SandboxPermissionAction = "abort" | "session" | "project" | "global"

export type PermissionDialogAction =
  | "allow-once"
  | "allow-always"
  | "deny"
  | "deny-reason"

export interface AgentPermissionPrompt {
  sessionId: string
  requestId: string
  kind: "select" | "input" | "sandbox" | "permission" | "confirm"
  title: string
  options?: string[]
  placeholder?: string
  grantTarget?: unknown
}

const SANDBOX_UI_ACTIONS: SandboxPermissionAction[] = [
  "session",
  "abort",
  "project",
  "global",
]

const SANDBOX_ACTION_LABELS: Record<
  SandboxPermissionAction,
  { label: string; hint?: string; needsConfirm?: boolean }
> = {
  session: { label: "仅本次会话允许" },
  abort: { label: "拒绝（保持拦截）" },
  project: {
    label: "允许并写入项目配置",
    hint: ".pi/sandbox.json",
    needsConfirm: true,
  },
  global: {
    label: "允许并写入全局配置",
    hint: "pi-agent/sandbox.json",
    needsConfirm: true,
  },
}

async function respondPermission(
  sessionId: string,
  requestId: string,
  payload: { action?: PermissionDialogAction; value?: string }
): Promise<void> {
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

  const dialog = prompt ? (
    <AgentPermissionDialogView
      key={prompt.requestId}
      prompt={prompt}
      onDismiss={dismiss}
    />
  ) : null

  return dialog
}

interface AgentPermissionDialogViewProps {
  prompt: AgentPermissionPrompt
  onDismiss: (payload: { action?: PermissionDialogAction; value?: string }) => void
}

function AgentPermissionDialogView({ prompt, onDismiss }: AgentPermissionDialogViewProps) {
  const [denyReason, setDenyReason] = useState("")
  const [sandboxConfirm, setSandboxConfirm] =
    useState<SandboxPermissionAction | null>(null)
  const titleLine = prompt.title.split("\n")[0] ?? "需要你的确认"
  const body = prompt.title.includes("\n")
    ? prompt.title.slice(prompt.title.indexOf("\n") + 1).trim()
    : ""

  if (prompt.kind === "sandbox") {
    if (sandboxConfirm) {
      const meta = SANDBOX_ACTION_LABELS[sandboxConfirm]
      return (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setSandboxConfirm(null)
              void onDismiss({ value: "abort" })
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认持久放行？</AlertDialogTitle>
              <AlertDialogDescription>
                {meta.label}
                {meta.hint ? `（${meta.hint}）` : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSandboxConfirm(null)}>
                返回
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void onDismiss({ value: sandboxConfirm })}
              >
                确认
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    }

    return (
      <AlertDialog open onOpenChange={(open) => !open && void onDismiss({ value: "abort" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titleLine}</AlertDialogTitle>
            {body ? (
              <AlertDialogDescription className="whitespace-pre-wrap">
                {body}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            {SANDBOX_UI_ACTIONS.map((action) => {
              const meta = SANDBOX_ACTION_LABELS[action]
              return (
                <Button
                  key={action}
                  variant={action === "session" ? "default" : "outline"}
                  className="h-auto min-h-9 flex-col items-start gap-0.5 py-2 text-left"
                  onClick={() => {
                    if (meta.needsConfirm) {
                      setSandboxConfirm(action)
                      return
                    }
                    void onDismiss({ value: action })
                  }}
                >
                  <span>{meta.label}</span>
                  {meta.hint ? (
                    <span className="text-xs text-muted-foreground">{meta.hint}</span>
                  ) : null}
                </Button>
              )
            })}
          </div>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  if (prompt.kind === "input") {
    return (
      <AlertDialog open onOpenChange={(open) => !open && void onDismiss({})}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titleLine}</AlertDialogTitle>
            {body ? <AlertDialogDescription>{body}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <Textarea
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder={prompt.placeholder ?? "可选：说明拒绝原因"}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void onDismiss({})}>跳过</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void onDismiss({ value: denyReason.trim() || undefined })
              }
            >
              提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  if (prompt.kind === "confirm") {
    return (
      <AlertDialog open onOpenChange={(open) => !open && void onDismiss({ value: "false" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titleLine}</AlertDialogTitle>
            {body ? (
              <AlertDialogDescription className="whitespace-pre-wrap">
                {body}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void onDismiss({ value: "false" })}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void onDismiss({ value: "true" })}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  if (prompt.kind === "permission") {
    const canAlwaysAllow = prompt.grantTarget != null

    return (
      <AlertDialog open onOpenChange={(open) => !open && void onDismiss({ action: "deny" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titleLine}</AlertDialogTitle>
            {body ? (
              <AlertDialogDescription className="whitespace-pre-wrap">
                {body}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="default"
              className="h-auto min-h-9 justify-start py-2 text-left"
              onClick={() => void onDismiss({ action: "allow-once" })}
            >
              允许（仅本次）
            </Button>
            {canAlwaysAllow ? (
              <Button
                variant="secondary"
                className="h-auto min-h-9 flex-col items-start gap-0.5 py-2 text-left"
                onClick={() => void onDismiss({ action: "allow-always" })}
              >
                <span>始终允许</span>
                <span className="text-xs text-muted-foreground">
                  写入全局 pi-permissions.jsonc，同类操作不再询问
                </span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-auto min-h-9 justify-start py-2 text-left"
              onClick={() => void onDismiss({ action: "deny" })}
            >
              拒绝
            </Button>
            <Button
              variant="outline"
              className="h-auto min-h-9 justify-start py-2 text-left"
              onClick={() => void onDismiss({ action: "deny-reason" })}
            >
              拒绝并说明
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  const options = prompt.options ?? []

  return (
    <AlertDialog open onOpenChange={(open) => !open && void onDismiss({})}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titleLine}</AlertDialogTitle>
          {body ? (
            <AlertDialogDescription className="whitespace-pre-wrap">
              {body}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <Button
              key={option}
              variant={option === "Yes" ? "default" : "outline"}
              className="h-auto min-h-9 justify-start py-2 text-left whitespace-pre-wrap"
              onClick={() => {
                if (option === "No, provide reason") {
                  void onDismiss({ action: "deny-reason" })
                  return
                }
                if (option === "Yes") {
                  void onDismiss({ action: "allow-once" })
                  return
                }
                if (option === "No") {
                  void onDismiss({ action: "deny" })
                  return
                }
                void onDismiss({ value: option })
              }}
            >
              {option === "Yes" ? "允许" : option === "No" ? "拒绝" : option}
            </Button>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void onDismiss({})}>取消</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
