import { motion } from "framer-motion"

import { AgentActivityTimeline } from "~/components/chat/agent-activity-timeline"
import { NomiFace } from "~/components/nomi-face"
import { TiptapContent } from "~/components/tiptap/TiptapContent"
import type { ChatMessage } from "~/stores/app-store"

const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: "easeOut" as const },
}

export function ChatMessageBubble({
  message,
  modelName,
  index,
}: {
  message: ChatMessage
  modelName: string
  index: number
}) {
  void index
  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const errorText = message.errorMessage?.trim() || (message.role === "error" ? message.content : "")
  const hasPartial =
    Boolean(message.content?.trim()) ||
    Boolean(message.thinking?.trim()) ||
    (message.activity?.length ?? 0) > 0 ||
    (message.toolCalls?.length ?? 0) > 0 ||
    Boolean(message.usageSummary?.trim())

  if (isUser) {
    const longText = !message.contentJson && message.content.length > 1200
    return (
      <motion.div {...enter} className="flex justify-end py-2 first:pt-1">
        <div className="max-w-[75%] min-w-0 overflow-hidden rounded-[20px] rounded-br-[4px] bg-linear-to-br from-primary to-[oklch(0.49_0.13_158)] px-4 py-2.5 text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] text-primary-foreground shadow-sm dark:from-[oklch(0.70_0.14_155)] dark:to-[oklch(0.62_0.13_158)] dark:text-[oklch(0.16_0.02_155)]">
          {message.contentJson ? (
            <TiptapContent
              doc={message.contentJson}
              className="min-w-0 break-words [overflow-wrap:anywhere] [&_*]:max-w-full [&_pre]:overflow-x-auto [&_code]:break-all"
            />
          ) : longText ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">场景上下文（点击展开完整提示词）</summary>
              <div className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm opacity-90">{message.content}</div>
            </details>
          ) : (
            <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</div>
          )}
        </div>
      </motion.div>
    )
  }

  if ((message.role === "error" || message.failed) && !hasPartial) {
    return (
      <motion.div {...enter} className="py-3">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide opacity-80">请求失败</p>
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {errorText || message.content || "生成失败"}
          </div>
        </div>
      </motion.div>
    )
  }

  const isInitialLoading = isAssistant && message.isStreaming && !hasPartial

  if (isInitialLoading) {
    return (
      <motion.div {...enter} className="flex gap-3 py-3">
        <NomiFace mood="thinking" className="mt-0.5 size-7 shrink-0" />
        <div className="flex items-center gap-2 pt-1.5">
          <span className="text-xs font-medium text-foreground/70">{modelName}</span>
          <span className="flex gap-1">
            <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="size-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div {...enter} className="flex gap-3 py-3">
      <NomiFace mood={message.isStreaming ? "talking" : "idle"} className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/70">{modelName}</span>
          {message.isStreaming && <span className="size-1.5 rounded-full bg-primary/50 animate-pulse" />}
        </div>
        {hasPartial ? (
          <AgentActivityTimeline
            toolCalls={message.toolCalls}
            activity={message.activity}
            usageSummary={message.usageSummary}
            isStreaming={message.isStreaming}
          />
        ) : null}
        {message.failed && errorText ? (
          <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">请求失败</p>
            <div className="whitespace-pre-wrap break-words leading-relaxed">{errorText}</div>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
