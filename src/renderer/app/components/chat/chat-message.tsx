import { Loader2 } from "lucide-react"

import { AgentActivityTimeline } from "~/components/chat/agent-activity-timeline"
import { TiptapContent } from "~/components/tiptap/TiptapContent"
import type { ChatMessage } from "~/stores/app-store"
export function ChatMessageBubble({
  message,
  modelName,
}: {
  message: ChatMessage
  modelName: string
}) {
  const isUser = message.role === "user"
  const isError = message.role === "error" || Boolean(message.failed)

  if (isUser) {
    const hasRich = Boolean(message.contentJson)
    return (
      <div className="flex justify-end py-3 first:pt-1">
        <div className="max-w-[min(100%,34rem)] rounded-[20px] bg-muted/90 px-4 py-2.5 text-[15px] leading-relaxed text-foreground shadow-sm ring-1 ring-border/30">
          {hasRich ? (
            <TiptapContent doc={message.contentJson ?? null} />
          ) : (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <article className="py-3">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide opacity-80">
            请求失败
          </p>
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>
        </div>
      </article>
    )
  }

  const hasActivity =
    Boolean(message.isStreaming) ||
    Boolean(message.content?.trim()) ||
    Boolean(message.thinking?.trim()) ||
    (message.agentSteps?.length ?? 0) > 0 ||
    (message.toolCalls?.length ?? 0) > 0 ||
    Boolean(message.usageSummary?.trim())

  return (
    <article className="group/msg py-4 first:pt-2">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
        <span>{modelName}</span>
      </div>

      {hasActivity ? (
        <AgentActivityTimeline
          agentSteps={message.agentSteps}
          toolCalls={message.toolCalls}
          thinking={message.thinking}
          content={message.content}
          usageSummary={message.usageSummary}
          isStreaming={message.isStreaming}
        />
      ) : (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>正在生成</span>
        </div>
      )}
    </article>
  )
}
