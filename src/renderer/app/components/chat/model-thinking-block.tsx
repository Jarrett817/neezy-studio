import { useEffect, useRef, useState } from "react"
import { AlertCircle, Check, ChevronRight, Loader2 } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { type AgentStep, type ChatToolCall, toolLabel } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

function StepRow({ step }: { step: AgentStep }) {
  const isActive = step.status === "active"
  const isDone = step.status === "done"
  const isError = step.variant === "error"

  return (
    <li
      className={cn(
        "flex items-start gap-2.5 py-0.5 text-xs leading-snug",
        isActive ? "text-foreground" : "text-muted-foreground",
        isError && "text-destructive"
      )}
    >
      <span className="mt-1 flex size-4 shrink-0 items-center justify-center">
        {isActive ? (
          <Loader2 className="size-3 animate-spin text-foreground/70" />
        ) : isDone ? (
          isError ? (
            <AlertCircle className="size-3" />
          ) : (
            <Check className="size-3 text-foreground/40" />
          )
        ) : (
          <span className="size-1.5 rounded-full border border-border/50" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("font-medium", isActive && "text-foreground")}>
          {step.label}
        </span>
        {step.detail ? (
          <span className="text-muted-foreground"> · {step.detail}</span>
        ) : null}
      </span>
    </li>
  )
}

function buildTimelineSteps(
  agentSteps: AgentStep[],
  tools: ChatToolCall[]
): AgentStep[] {
  const fromAgent = agentSteps.filter(
    (s) => s.status === "active" || s.status === "done"
  )
  if (fromAgent.length > 0) return fromAgent

  return tools.map((t) => ({
    id: t.toolCallId || t.name,
    label: toolLabel(t.name),
    detail:
      t.status === "running"
        ? t.partialResult?.trim() || "执行中…"
        : t.result?.trim().slice(0, 80) || "已完成",
    status:
      t.status === "running"
        ? ("active" as const)
        : ("done" as const),
    variant: t.status === "error" ? ("error" as const) : undefined,
  }))
}

function headerLabel(
  timeline: AgentStep[],
  workflowBusy: boolean,
  isStreaming: boolean
): string {
  if (workflowBusy) {
    const active = timeline.find((s) => s.status === "active")
    return active?.label ?? "处理中"
  }
  if (timeline.length > 0) {
    return `${timeline.length} 步已完成`
  }
  if (isStreaming) return "准备中"
  return "活动记录"
}

export function ModelThinkingBlock({
  thinking,
  isStreaming,
  hasAnswerContent = false,
  toolCalls,
  agentSteps,
  usageSummary,
  className,
}: {
  modelName: string
  thinking: string
  isStreaming: boolean
  hasAnswerContent?: boolean
  toolCalls?: ChatToolCall[]
  agentSteps?: AgentStep[]
  usageSummary?: string
  transport?: import("~/config/chat-models").ModelTransport
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tools = toolCalls ?? []
  const timeline = buildTimelineSteps(agentSteps ?? [], tools)
  const hasTimeline = timeline.length > 0
  const hasThinking = thinking.trim().length > 0
  const hasUsage = Boolean(usageSummary?.trim())
  const hasActiveStep = timeline.some((s) => s.status === "active")
  const hasRunningTool = tools.some((t) => t.status === "running")
  const workflowBusy = hasActiveStep || hasRunningTool
  const thinkingLive = isStreaming && hasThinking && !hasAnswerContent
  const showPanel =
    hasTimeline || hasThinking || hasUsage || (isStreaming && !hasAnswerContent)

  const [open, setOpen] = useState(false)
  const userToggledRef = useRef(false)

  useEffect(() => {
    if (userToggledRef.current) return
    if (workflowBusy || thinkingLive || (isStreaming && !hasAnswerContent)) {
      setOpen(true)
    }
  }, [workflowBusy, thinkingLive, isStreaming, hasAnswerContent])

  useEffect(() => {
    if (userToggledRef.current) return
    if (!isStreaming && !workflowBusy) setOpen(false)
  }, [isStreaming, workflowBusy])

  useEffect(() => {
    if (!thinkingLive || !hasThinking) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thinking, thinkingLive, hasThinking])

  if (!showPanel) return null

  const title = headerLabel(timeline, workflowBusy, isStreaming)

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        userToggledRef.current = true
        setOpen(next)
      }}
      className={cn("mb-3 text-muted-foreground", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground">
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
        <span className="font-medium text-foreground/75">{title}</span>
        {workflowBusy ? (
          <span className="text-muted-foreground/80">进行中</span>
        ) : null}
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1 pb-2">
        {hasTimeline ? (
          <ul className="space-y-0.5 border-l border-border/30 pl-3">
            {timeline.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        ) : isStreaming && !hasAnswerContent ? (
          <p className="border-l border-border/30 pl-3 text-xs text-muted-foreground">
            等待模型响应…
          </p>
        ) : null}

        {hasThinking && open ? (
          <div
            ref={scrollRef}
            className={cn(
              "mt-2 max-h-24 overflow-y-auto border-l border-border/30 pl-3 text-[12px] leading-relaxed whitespace-pre-wrap text-muted-foreground/90",
              hasTimeline && "mt-2"
            )}
          >
            {thinking}
          </div>
        ) : null}

        {hasUsage && open ? (
          <p className="mt-2 border-l border-border/30 pl-3 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
            {usageSummary}
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
