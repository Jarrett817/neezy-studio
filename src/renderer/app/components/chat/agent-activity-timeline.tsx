import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  Check,
  ChevronRight,
  File,
  FilePen,
  FilePlus,
  FileSearch,
  FolderOpen,
  Loader2,
  Search,
} from "lucide-react"

import { MarkdownContent } from "~/components/markdown-content"
import {
  type AgentStep,
  type AssistantActivityItem,
  type ChatToolCall,
  FILE_PATH_TOOLS,
  pickToolPath,
  pickToolPattern,
  toolLabel,
} from "~/lib/agent-steps"
import {
  buildAssistantTimeline,
  type TimelineItem,
} from "~/lib/assistant-timeline"
import { cn } from "~/lib/utils"

function StreamCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-foreground/50"
      aria-hidden
    />
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1">
      <span
        className="size-1.5 rounded-full bg-foreground/30 animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="size-1.5 rounded-full bg-foreground/30 animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="size-1.5 rounded-full bg-foreground/30 animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </span>
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
        <p
          className={cn(
            "font-medium text-foreground/90",
            isActive && "text-foreground"
          )}
        >
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

function fileToolIcon(name: string): LucideIcon {
  switch (name) {
    case "ls":
      return FolderOpen
    case "find":
      return FileSearch
    case "grep":
      return Search
    case "edit":
      return FilePen
    case "write":
      return FilePlus
    default:
      return File
  }
}

function FileToolBody({ tool }: { tool: ChatToolCall }) {
  const Icon = fileToolIcon(tool.name)
  const path = pickToolPath(tool.name, tool.args)
  const pattern = pickToolPattern(tool.name, tool.args)
  const extraKeys = Object.keys(tool.args).filter(
    (k) => !["path", "file", "pattern", "query", "glob"].includes(k)
  )

  return (
    <div className="bg-muted/15 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Icon
          className="mt-0.5 size-4 shrink-0 text-foreground/55"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          {path ? (
            <p className="font-mono text-[12px] leading-snug break-all text-foreground/90">
              {path}
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">（未指定路径）</p>
          )}
          {pattern ? (
            <p className="text-[11px] text-muted-foreground">
              匹配{" "}
              <span className="font-mono text-foreground/80">{pattern}</span>
            </p>
          ) : null}
        </div>
      </div>
      {extraKeys.length > 0 ? (
        <pre className="mt-2 max-h-28 overflow-auto rounded-md bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
          {formatInvocationPayload(
            Object.fromEntries(extraKeys.map((k) => [k, tool.args[k]]))
          )}
        </pre>
      ) : null}
    </div>
  )
}

function ToolInvocationBlock({ tool }: { tool: ChatToolCall }) {
  const isBash = tool.name === "bash"
  const isFileTool = FILE_PATH_TOOLS.has(tool.name)
  const command =
    typeof tool.args.command === "string" ? tool.args.command.trim() : ""
  const cwd =
    typeof tool.args.cwd === "string" && tool.args.cwd.trim()
      ? tool.args.cwd.trim()
      : undefined
  const output = (
    tool.partialResult?.trim() ||
    tool.result?.trim() ||
    ""
  ).trim()
  const running = tool.status === "running"
  const failed = tool.status === "error"
  const pathSummary = isFileTool ? pickToolPath(tool.name, tool.args) : ""

  return (
    <details
      className={cn(
        "overflow-hidden rounded-lg border text-xs",
        running && "border-border/50",
        failed && "border-destructive",
        !running && !failed && "border-emerald-500/70"
      )}
      open={running || failed}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate font-medium text-foreground">
          {toolLabel(tool.name)}
          {pathSummary ? (
            <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
              {pathSummary}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0",
            running && "text-muted-foreground",
            failed && "text-destructive",
            !running && !failed && "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {running ? "执行中" : failed ? "失败" : "已完成"}
        </span>
      </summary>

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
      ) : isFileTool ? (
        <FileToolBody tool={tool} />
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
    </details>
  )
}

function ThinkingBlock({
  text,
  streaming,
}: {
  text: string
  streaming?: boolean
}) {
  return (
    <details
      key={streaming ? "thinking-open" : "thinking-done"}
      open={streaming}
      className="group rounded-lg border border-border/40 bg-muted/15"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {streaming ? (
          <>
            <span>思考中</span>
            <Loader2 className="size-3 animate-spin" />
          </>
        ) : (
          <span>思考过程</span>
        )}
      </summary>
      <div className="border-t border-border/30 px-3 py-2.5">
        <MarkdownContent
          content={text}
          className="text-[12px] leading-relaxed text-muted-foreground/60 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_li]:text-[12px] [&_strong]:font-medium [&_strong]:text-muted-foreground/75 [&_code]:text-[11px] [&_a]:text-muted-foreground/80"
        />
      </div>
    </details>
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
    return <ThinkingBlock text={item.text} streaming={item.streaming} />
  }

  if (item.kind === "usage") {
    return (
      <p className="pt-1 text-[11px] tabular-nums text-muted-foreground">
        {item.text}
      </p>
    )
  }

  return (
    <div className="min-w-0 text-[15px] leading-relaxed text-foreground">
      {item.text ? (
        <div className={cn(item.streaming && "streaming-reply")}>
          <MarkdownContent content={item.text} variant="chat" />
          {item.streaming ? <StreamCursor /> : null}
        </div>
      ) : item.streaming ? (
        <TypingDots />
      ) : null}
    </div>
  )
}

export function AgentActivityTimeline({
  toolCalls,
  activity,
  usageSummary,
  isStreaming,
  className,
}: {
  toolCalls?: ChatToolCall[]
  activity?: AssistantActivityItem[]
  usageSummary?: string
  isStreaming?: boolean
  className?: string
}) {
  const items = buildAssistantTimeline({
    toolCalls,
    activity,
    usageSummary,
    isStreaming,
  })

  if (items.length === 0) {
    if (!isStreaming) return null
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-2 text-sm text-muted-foreground/60",
          className
        )}
      >
        <TypingDots />
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
