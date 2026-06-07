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
    return (
      <div className="flex justify-end py-2 first:pt-1 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
        <div className="chat-bubble-user max-w-[75%] rounded-[20px] rounded-br-[4px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">
          {message.contentJson ? <TiptapContent doc={message.contentJson} /> : <div className="whitespace-pre-wrap break-words">{message.content}</div>}
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
      <div className="py-3 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
        <div className="chat-bubble-assistant max-w-[85%] rounded-[20px] rounded-bl-[4px] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">N</span>
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{modelName}</span>
            <span className="flex gap-1 px-2">
              <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        </div>
      </div>
    )
  }

  const hasContent = Boolean(message.content?.trim()) || Boolean(message.thinking?.trim()) ||
    (message.agentSteps?.length ?? 0) > 0 || (message.toolCalls?.length ?? 0) > 0 ||
    Boolean(message.usageSummary?.trim())

  return (
    <div className="py-2 anim-fade" style={{ animationDelay: `${index * 30}ms` }}>
      <div className="chat-bubble-assistant max-w-[85%] rounded-[20px] rounded-bl-[4px] px-5 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">N</span>
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{modelName}</span>
          {message.isStreaming && <span className="size-1.5 rounded-full bg-primary/40 cursor-pulse" />}
        </div>
        {hasContent ? (
          <AgentActivityTimeline agentSteps={message.agentSteps} toolCalls={message.toolCalls}
            thinking={message.thinking} content={message.content} usageSummary={message.usageSummary} isStreaming={message.isStreaming} />
        ) : null}
      </div>
    </div>
  )
}