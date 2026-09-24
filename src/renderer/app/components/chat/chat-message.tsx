import { AgentActivityTimeline } from "~/components/chat/agent-activity-timeline"
import { TiptapContent } from "~/components/tiptap/TiptapContent"
import type { ChatMessage } from "~/stores/app-store"

export function ChatMessageBubble({
  message,
  modelName,
  index,
}: {
  message: ChatMessage
  modelName: string
  index: number
}) {
  const isUser = message.role === "user"
  const isError = message.role === "error" || Boolean(message.failed)
  const isAssistant = message.role === "assistant"

  if (isUser) {
    const longText = !message.contentJson && message.content.length > 1200
    return (
      <div className="flex justify-end py-2 first:pt-1 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
        <div className="chat-bubble-user max-w-[75%] rounded-[20px] rounded-br-[4px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">
          {message.contentJson ? (
            <TiptapContent doc={message.contentJson} />
          ) : longText ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">场景上下文（点击展开完整提示词）</summary>
              <div className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm opacity-90">{message.content}</div>
            </details>
          ) : (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-3 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide opacity-80">请求失败</p>
          <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
        </div>
      </div>
    )
  }

  const isInitialLoading = isAssistant && message.isStreaming &&
    !message.content?.trim() && !message.thinking?.trim() &&
    !(message.agentSteps?.length ?? 0) && !(message.toolCalls?.length ?? 0)

  if (isInitialLoading) {
    return (
      <div className="flex gap-3 py-3 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-xs font-semibold text-primary shadow-sm">
          N
        </span>
        <div className="flex items-center gap-2 pt-1.5">
          <span className="text-xs font-medium text-foreground/70">{modelName}</span>
          <span className="flex gap-1">
            <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </div>
    )
  }

  const hasContent = Boolean(message.content?.trim()) || Boolean(message.thinking?.trim()) ||
    (message.agentSteps?.length ?? 0) > 0 || (message.toolCalls?.length ?? 0) > 0 ||
    Boolean(message.usageSummary?.trim())

  return (
    <div className="flex gap-3 py-3 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-xs font-semibold text-primary shadow-sm">
        N
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/70">{modelName}</span>
          {message.isStreaming && <span className="size-1.5 rounded-full bg-primary/50 animate-pulse" />}
        </div>
        {hasContent ? (
          <AgentActivityTimeline agentSteps={message.agentSteps} toolCalls={message.toolCalls}
            thinking={message.thinking} content={message.content} usageSummary={message.usageSummary} isStreaming={message.isStreaming} />
        ) : null}
      </div>
    </div>
  )
}