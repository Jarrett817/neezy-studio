import { useEffect, useRef, useState } from "react"
import { AlertCircle, Check, ChevronRight, Loader2, Wrench } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  formatToolArgsSummary,
  type AgentStep,
  type ChatToolCall,
  toolLabel,
} from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

import type { ModelTransport } from "~/config/chat-models"

function ToolPill({ tool }: { tool: ChatToolCall }) {
  const argsSummary = formatToolArgsSummary(tool.name, tool.args)
  const isError = tool.status === "error"
  const isRunning = tool.status === "running"

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ring-1 ring-inset",
        isError
          ? "bg-destructive/10 text-destructive ring-destructive/25"
          : isRunning
            ? "bg-muted/60 text-foreground ring-border/40"
            : "bg-muted/40 text-muted-foreground ring-border/30"
      )}
      title={tool.result?.slice(0, 200) || tool.partialResult?.slice(0, 200)}
    >
      {isRunning ? (
        <Loader2 className="size-2.5 shrink-0 animate-spin" />
      ) : isError ? (
        <AlertCircle className="size-2.5 shrink-0" />
      ) : (
        <Check className="size-2.5 shrink-0 opacity-50" />
      )}
      <span className="font-medium text-foreground/90">{toolLabel(tool.name)}</span>
      {argsSummary ? (
        <span className="truncate opacity-70">{argsSummary}</span>
      ) : null}
    </span>
  )
}

function StepIcon({ step }: { step: AgentStep }) {
  if (step.status === "active") {
    return <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-foreground/70" />
  }
  if (step.status === "done") {
    return step.variant === "error" ? (
      <AlertCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
    ) : (
      <Check className="mt-0.5 size-3 shrink-0 text-foreground/45" />
    )
  }
  return (
    <span className="mt-1.5 size-1.5 shrink-0 rounded-full border border-border/50 bg-transparent" />
  )
}

function AgentWorkflowList({ steps }: { steps: AgentStep[] }) {
  const visible = steps.filter((s) => s.status === "active" || s.status === "done")
  if (visible.length === 0) return null

  return (
    <ul className="space-y-1.5">
      {visible.map((step) => (
        <li
          key={step.id}
          className={cn(
            "flex items-start gap-2 text-xs leading-snug transition-opacity",
            step.status === "active" ? "text-foreground/90" : "text-muted-foreground",
            step.variant === "error" && "text-destructive"
          )}
        >
          <StepIcon step={step} />
          <span className="min-w-0">
            <span
              className={cn(
                "font-medium",
                step.variant === "error" ? "text-destructive" : "text-foreground/85"
              )}
            >
              {step.label}
            </span>
            {step.detail ? (
              <span className="text-muted-foreground"> · {step.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function activitySummary(
  tools: ChatToolCall[],
  steps: AgentStep[] | undefined,
  hasActiveStep: boolean
): string {
  const activeStep = steps?.find((s) => s.status === "active")
  if (activeStep) {
    return activeStep.detail
      ? `${activeStep.label} · ${activeStep.detail}`
      : activeStep.label
  }
  const runningTool = tools.find((t) => t.status === "running")
  if (runningTool) return toolLabel(runningTool.name)
  if (hasActiveStep) return "处理中"
  const doneCount = steps?.filter((s) => s.status === "done").length ?? 0
  if (doneCount > 0) return `已完成 ${doneCount} 步`
  return "活动"
}

export function ModelThinkingBlock({
  modelName,
  thinking,
  isStreaming,
  hasAnswerContent = false,
  toolCalls,
  agentSteps,
  usageSummary,
  transport = "openai-compatible",
  className,
}: {
  modelName: string
  thinking: string
  isStreaming: boolean
  hasAnswerContent?: boolean
  toolCalls?: ChatToolCall[]
  agentSteps?: AgentStep[]
  usageSummary?: string
  transport?: ModelTransport
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tools = toolCalls ?? []
  const hasTools = tools.length > 0
  const steps = agentSteps ?? []
  const hasSteps = steps.some((s) => s.status === "active" || s.status === "done")
  const hasActiveStep = steps.some((s) => s.status === "active")
  const hasRunningTool = tools.some((t) => t.status === "running")
  const hasThinking = thinking.trim().length > 0
  const hasUsage = Boolean(usageSummary?.trim())
  const workflowBusy = hasActiveStep || hasRunningTool
  const thinkingLive = isStreaming && hasThinking && !hasAnswerContent

  const [open, setOpen] = useState(workflowBusy || thinkingLive)

  if (
    isStreaming &&
    !hasThinking &&
    !hasTools &&
    !hasSteps &&
    hasAnswerContent &&
    !workflowBusy
  ) {
    return null
  }

  useEffect(() => {
    if (workflowBusy || thinkingLive) setOpen(true)
  }, [workflowBusy, thinkingLive])

  useEffect(() => {
    if (!isStreaming && !workflowBusy) setOpen(false)
  }, [isStreaming, workflowBusy])

  useEffect(() => {
    if (hasAnswerContent && !workflowBusy && !thinkingLive) setOpen(false)
  }, [hasAnswerContent, workflowBusy, thinkingLive])

  useEffect(() => {
    if (!thinkingLive || !hasThinking) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thinking, thinkingLive, hasThinking])

  if (!hasThinking && !hasTools && !hasSteps && !isStreaming && !hasUsage) {
    return null
  }

  const summary = activitySummary(tools, steps, workflowBusy)
  const waitHint = transport === "ollama" ? "Ollama" : "模型"
  const headerBusy = workflowBusy || thinkingLive

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("text-muted-foreground", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-xs transition-colors hover:bg-muted/40 hover:text-foreground">
        {headerBusy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground/60" />
        ) : (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-90"
            )}
          />
        )}
        <span className="font-medium text-foreground/80">
          {headerBusy ? "进行中" : "活动记录"}
        </span>
        <span className="min-w-0 truncate opacity-70">
          {summary} · {modelName} · {waitHint}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-1.5 space-y-2 border-l border-border/25 pl-3">
        {hasSteps ? <AgentWorkflowList steps={steps} /> : null}

        {hasTools ? (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((tc) => (
              <ToolPill
                key={tc.toolCallId || `${tc.name}-${tc.result.slice(0, 24)}`}
                tool={tc}
              />
            ))}
          </div>
        ) : null}

        {hasThinking ? (
          <div
            ref={scrollRef}
            className="max-h-28 overflow-y-auto text-[12px] leading-relaxed whitespace-pre-wrap text-muted-foreground/90"
          >
            {thinking}
          </div>
        ) : null}

        {hasUsage ? (
          <p className="text-[10px] tracking-wide uppercase opacity-60">
            {usageSummary}
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
