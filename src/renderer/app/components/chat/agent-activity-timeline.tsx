import { AlertCircle, Check, Loader2 } from "lucide-react"

import { MarkdownContent } from "~/components/markdown-content"
import {
  buildAssistantTimeline,
  type TimelineItem,
} from "~/lib/assistant-timeline"
import { toolLabel, type AgentStep, type ChatToolCall } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

function StreamCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-foreground/70"
      aria-hidden
    />
  )
}

function WorkflowStepRow({ step }: { step: AgentStep }) {
  const isActive = step.status === "active"
  const isDone = step.status === "done"
  const isError = step.variant === "error"

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs",
        isError && "border-destructive/30 bg-destructive/5"
      )}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {isActive ? (
          <Loader2 className="size-3.5 animate-spin text-foreground/70" />
        ) : isDone ? (
          isError ? (
            <AlertCircle className="size-3.5 text-destructive" />
          ) : (
            <Check className="size-3.5 text-foreground/45" />
          )
        ) : (
          <span className="size-1.5 rounded-full border border-border/50" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-foreground/90", isActive && "text-foreground")}>
          {step.label}
        </p>
        {step.detail ? (
          <p className="mt-0.5 text-muted-foreground">{step.detail}</p>
        ) : null}
      </div>
    </div>
  )
}

function formatInvocationPayload(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  if (keys.length === 0) return "{}"
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

function ToolInvocationBlock({ tool }: { tool: ChatToolCall }) {
  const isBash = tool.name === "bash"
  const command =
    typeof tool.args.command === "string" ? tool.args.command.trim() : ""
  const cwd =
    typeof tool.args.cwd === "string" && tool.args.cwd.trim()
      ? tool.args.cwd.trim()
      : undefined
  const output = (tool.partialResult?.trim() || tool.result?.trim() || "").trim()
  const running = tool.status === "running"
  const failed = tool.status === "error"

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border text-xs",
        failed ? "border-destructive/35" : "border-border/50"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
        <span className="font-medium text-foreground">{toolLabel(tool.name)}</span>
        <span className="text-muted-foreground">
          {running ? "执行中" : failed ? "失败" : "已完成"}
        </span>
      </div>

      {isBash ? (
        <div className="bg-zinc-950 text-zinc-100">
          {cwd ? (
            <div className="border-b border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-zinc-400">
              cwd: {cwd}
            </div>
          ) : null}
          <pre className="max-h-48 overflow-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
            <span className="select-none text-emerald-400">$ </span>
            {command || "(空命令)"}
          </pre>
        </div>
      ) : (
        <pre className="max-h-40 overflow-auto bg-muted/15 px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground/85">
          {formatInvocationPayload(tool.args)}
        </pre>
      )}

      {output ? (
        <div className="border-t border-border/40 bg-background/80">
          <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            输出
          </p>
          <pre className="max-h-56 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
            {output}
          </pre>
        </div>
      ) : running ? (
        <p className="border-t border-border/40 px-3 py-2 text-muted-foreground">
          等待输出…
        </p>
      ) : null}
    </div>
  )
}

function TimelineBlock({ item }: { item: TimelineItem }) {
  if (item.kind === "step") {
    if (item.tool) {
      return <ToolInvocationBlock tool={item.tool} />
    }
    return <WorkflowStepRow step={item.step} />
  }

  if (item.kind === "thinking") {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5">
        <p className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          模型思考
        </p>
        <pre className="max-h-64 overflow-y-auto text-[12px] leading-relaxed whitespace-pre-wrap text-foreground/85">
          {item.text}
        </pre>
      </div>
    )
  }

  if (item.kind === "usage") {
    return (
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
        Token · {item.text}
      </p>
    )
  }

  return (
    <div className="min-w-0 text-[15px] text-foreground">
      <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        回复
      </p>
      {item.text ? (
        <div className={cn(item.streaming && "streaming-reply")}>
          <MarkdownContent content={item.text} variant="chat" />
          {item.streaming ? <StreamCursor /> : null}
        </div>
      ) : item.streaming ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>正在生成</span>
          <StreamCursor />
        </div>
      ) : null}
    </div>
  )
}

export function AgentActivityTimeline({
  agentSteps,
  toolCalls,
  thinking,
  content,
  usageSummary,
  isStreaming,
  className,
}: {
  agentSteps?: AgentStep[]
  toolCalls?: ChatToolCall[]
  thinking?: string
  content?: string
  usageSummary?: string
  isStreaming?: boolean
  className?: string
}) {
  const items = buildAssistantTimeline({
    agentSteps,
    toolCalls,
    thinking,
    content,
    usageSummary,
    isStreaming,
  })

  if (items.length === 0) {
    if (!isStreaming) return null
    return (
      <div className={cn("flex items-center gap-2 py-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" />
        <span>等待模型响应</span>
        <StreamCursor />
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => (
        <TimelineBlock key={item.id} item={item} />
      ))}
    </div>
  )
}
