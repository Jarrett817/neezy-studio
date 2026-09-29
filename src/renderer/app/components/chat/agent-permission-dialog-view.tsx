import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'

import type {
  AgentPermissionPrompt,
  PermissionDialogAction,
} from './agent-permission-dialog'

interface AgentPermissionDialogViewProps {
  prompt: AgentPermissionPrompt
  onDismiss: (payload: { action?: PermissionDialogAction; value?: string }) => void
}

export default function AgentPermissionDialogView({ prompt, onDismiss }: AgentPermissionDialogViewProps) {
  const [denyReason, setDenyReason] = useState("")
  const titleLine = prompt.title.split("\n")[0] ?? "需要你的确认"
  const body = prompt.title.includes("\n")
    ? prompt.title.slice(prompt.title.indexOf("\n") + 1).trim()
    : ""

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
