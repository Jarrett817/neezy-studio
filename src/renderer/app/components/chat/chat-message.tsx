import { Loader2 } from "lucide-react"

import { ModelThinkingBlock } from "~/components/chat/model-thinking-block"
import { MarkdownContent } from "~/components/markdown-content"
import type { ModelTransport } from "~/config/chat-models"
import { cn } from "~/lib/utils"
import type { ChatMessage } from "~/stores/app-store"

function StreamCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-foreground/70"
      aria-hidden
    />
  )
}

export function ChatMessageBubble({
  message,
  modelName,
  transport,
}: {
  message: ChatMessage
  modelName: string
  transport?: ModelTransport
}) {
  const isUser = message.role === "user"
  const isError = message.role === "error" || Boolean(message.failed)
  const hasAnswer = Boolean(message.content?.trim())
  const hasThinkingText = Boolean(message.thinking?.trim())
  const workflowActive =
    message.agentSteps?.some((s) => s.status === "active") ||
    message.toolCalls?.some((t) => t.status === "running")
  const showThinking =
    message.role === "assistant" &&
    (workflowActive ||
      (message.isStreaming && !hasAnswer) ||
      (hasThinkingText && message.isStreaming && !hasAnswer))

  if (isUser) {
    return (
      <div className="flex justify-end py-3 first:pt-1">
        <div className="max-w-[min(100%,34rem)] rounded-[20px] bg-muted/90 px-4 py-2.5 text-[15px] leading-relaxed text-foreground shadow-sm ring-1 ring-border/30">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
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

  return (
    <article className="group/msg py-4 first:pt-2">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
        <span>{modelName}</span>
        {message.isStreaming && !hasAnswer && !showThinking ? (
          <Loader2 className="size-3 animate-spin opacity-60" />
        ) : null}
      </div>

      {showThinking ? (
        <ModelThinkingBlock
          modelName={modelName}
          thinking={message.thinking ?? ""}
          isStreaming={Boolean(message.isStreaming)}
          hasAnswerContent={hasAnswer}
          toolCalls={message.toolCalls}
          agentSteps={message.agentSteps}
          usageSummary={message.usageSummary}
          transport={transport}
          className="mb-3"
        />
      ) : null}

      {hasAnswer ? (
        <div
          className={cn(
            "min-w-0 text-[15px] text-foreground",
            message.isStreaming && "streaming-reply"
          )}
        >
          <MarkdownContent content={message.content} variant="chat" />
          {message.isStreaming ? <StreamCursor /> : null}
        </div>
      ) : message.isStreaming && !showThinking ? (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>正在生成</span>
          <StreamCursor />
        </div>
      ) : null}
    </article>
  )
}
