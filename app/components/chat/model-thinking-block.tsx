import { useEffect, useRef } from "react"
import { ChevronRight, Loader2 } from "lucide-react"

import { toolLabel } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

export function ModelThinkingBlock({
  modelName,
  thinking,
  isStreaming,
  toolCalls,
  className,
}: {
  modelName: string
  thinking: string
  isStreaming: boolean
  toolCalls?: { name: string }[]
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasTools = Boolean(toolCalls?.length)
  const hasThinking = thinking.trim().length > 0

  useEffect(() => {
    if (!isStreaming || !hasThinking) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thinking, isStreaming, hasThinking])

  if (!hasThinking && !hasTools && !isStreaming) return null

  if (!hasThinking && hasTools) {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {toolCalls!.map((tc, i) => (
          <span
            key={`${tc.name}-${i}`}
            className="rounded-md border border-border/25 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {toolLabel(tc.name)}
          </span>
        ))}
      </div>
    )
  }

  if (!hasThinking && isStreaming) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border/30 bg-muted/25 px-3.5 py-2.5 text-sm",
          className
        )}
      >
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        <span className="font-medium text-foreground">准备回复</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {modelName} · 正在载入上下文
        </span>
      </div>
    )
  }

  return (
    <details
      open={isStreaming || hasThinking}
      className={cn(
        "group/think overflow-hidden rounded-xl border border-border/30 bg-muted/25",
        className
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm",
          "[&::-webkit-details-marker]:hidden"
        )}
      >
        {isStreaming ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/think:rotate-90" />
        )}
        <span className="font-medium text-foreground">
          {isStreaming ? "思考中" : "思考过程"}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {modelName}
        </span>
      </summary>

      <div className="space-y-2 border-t border-border/20 px-3.5 pt-2 pb-3.5">
        {hasThinking ? (
          <div
            ref={scrollRef}
            className="relative max-h-[min(42vh,360px)] overflow-y-auto"
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {thinking}
            </p>
            {isStreaming && (
              <span
                className="mt-1 inline-block h-4 w-0.5 animate-pulse rounded-full bg-primary/70"
                aria-hidden
              />
            )}
          </div>
        ) : null}

        {hasTools && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {toolCalls!.map((tc, i) => (
              <span
                key={`${tc.name}-${i}`}
                className="rounded-md bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {toolLabel(tc.name)}
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
