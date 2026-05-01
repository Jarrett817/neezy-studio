import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Bot,
  MessageSquare,
  Send,
  Square,
  Trash2,
  User,
  Zap,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import { listenTauri } from "~/services/tauri-client"
import {
  cancelGeneration,
  generateTextStream,
  getRuntimeMetrics,
  getRuntimeSettings,
  type LlmMessage,
} from "~/services/workspace"
import { MarkdownContent } from "~/components/markdown-content"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  isStreaming?: boolean
}

type StreamEvent =
  | { type: "token"; text?: string }
  | { type: "status"; phase?: string; message?: string }

const STREAM_FLUSH_INTERVAL_MS = 48
const FIRST_TOKEN_WARN_MS = 5000

export default function ChatRoute() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<string>("")
  const [systemPrompt, setSystemPrompt] = useState("你是一个温暖、专业的助手。")
  const activeAssistantId = useRef<string | null>(null)
  const streamBufferRef = useRef("")
  const flushTimerRef = useRef<number | null>(null)
  const firstTokenTimerRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    staleTime: 10000,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, currentPhase])

  const flushBufferedTokens = (targetId?: string | null) => {
    const buffered = streamBufferRef.current
    const activeId = targetId ?? activeAssistantId.current
    if (!buffered || !activeId) return
    streamBufferRef.current = ""
    setMessages((items) =>
      items.map((item) =>
        item.id === activeId
          ? { ...item, content: item.content + buffered }
          : item
      )
    )
  }

  const scheduleFlush = () => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      flushBufferedTokens()
    }, STREAM_FLUSH_INTERVAL_MS)
  }

  const mutation = useMutation({
    mutationFn: async ({ messages }: { messages: LlmMessage[] }) =>
      generateTextStream({
        modelId: metrics?.recommendedModelId,
        messages,
        maxTokens: 1024,
        stream: true,
      }),
    onSuccess: () => {
      setIsGenerating(false)
      setCurrentPhase("")
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushBufferedTokens(activeAssistantId.current)
      setMessages((items) =>
        items.map((item) =>
          item.id === activeAssistantId.current
            ? { ...item, isStreaming: false }
            : item
        )
      )
      activeAssistantId.current = null
    },
    onError: (error) => {
      setIsGenerating(false)
      setCurrentPhase("")
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushBufferedTokens()
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "error",
          content: error instanceof Error ? error.message : "生成失败",
        },
      ])
      activeAssistantId.current = null
    },
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    listenTauri<StreamEvent>("content-agent-event", (event) => {
      const activeId = activeAssistantId.current
      if (!activeId) return
      if (event.payload.type === "token") {
        const token = event.payload.text
        if (!token) return
        if (firstTokenTimerRef.current !== null) {
          window.clearTimeout(firstTokenTimerRef.current)
          firstTokenTimerRef.current = null
        }
        streamBufferRef.current = `${streamBufferRef.current}${token}`
        scheduleFlush()
        return
      }
      if (event.payload.type === "status") {
        const { phase, message } = event.payload
        if (phase) setCurrentPhase(phase)
        if (message) {
          setMessages((items) =>
            items.map((item) =>
              item.id === activeId
                ? { ...item, content: item.content + (message ? `${message}\n` : "") }
                : item
            )
          )
        }
      }
    }).then((handler) => {
      if (disposed) {
        handler()
        return
      }
      unlisten = handler
    })
    return () => {
      disposed = true
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      if (firstTokenTimerRef.current !== null) {
        window.clearTimeout(firstTokenTimerRef.current)
        firstTokenTimerRef.current = null
      }
      flushBufferedTokens()
      unlisten?.()
    }
  }, [])

  const send = () => {
    const text = input.trim()
    if (!text || mutation.isPending) return
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    streamBufferRef.current = ""
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId
    setIsGenerating(true)
    setCurrentPhase("正在思考...")
    const conversationMessages = [
      ...messages.filter((m) => m.role !== "error"),
      { id: userId, role: "user", content: text },
    ]
    setMessages((items) => [
      ...items,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ])
    firstTokenTimerRef.current = window.setTimeout(() => {
      const activeId = activeAssistantId.current
      if (!activeId) return
      setMessages((items) =>
        items.map((item) =>
          item.id === activeId
            ? {
                ...item,
                content:
                  item.content +
                  "**[慢]** 首个响应超过 5 秒，模型可能在加载或推理中...\n",
              }
            : item
        )
      )
    }, FIRST_TOKEN_WARN_MS)
    setInput("")
    mutation.mutate({
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    })
  }

  const stop = async () => {
    await cancelGeneration()
    setIsGenerating(false)
    setCurrentPhase("已停止")
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    if (firstTokenTimerRef.current !== null) {
      window.clearTimeout(firstTokenTimerRef.current)
      firstTokenTimerRef.current = null
    }
    flushBufferedTokens()
    setMessages((items) =>
      items.map((item) =>
        item.id === activeAssistantId.current
          ? { ...item, isStreaming: false }
          : item
      )
    )
    activeAssistantId.current = null
    mutation.reset()
  }

  const clearChat = () => setMessages([])

  return (
    <div className="flex h-[calc(100svh-80px)] flex-col gap-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageSquare className="size-4" />
          </div>
          <span className="text-sm font-semibold">模型对话</span>
          {metrics?.recommendedModelId && (
            <span className="text-xs text-muted-foreground">
              · {metrics.recommendedModelId}
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs rounded-xl"
            onClick={clearChat}
          >
            <Trash2 className="size-3" />
            清空
          </Button>
        )}
      </div>

      {/* 消息区 */}
      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <Bot className="size-10 text-muted-foreground/30 mb-3" />
            <h3 className="font-display text-lg font-semibold">直接对话模型</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              直接测试 LLM 对话能力
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {/* 流式状态指示器 */}
            {isGenerating && currentPhase && (
              <div className="flex items-center gap-2 px-4">
                <Spinner className="size-4 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {currentPhaseLabel(currentPhase)}
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* 输入区 */}
      <div className="glass-warm rounded-2xl border border-border/10 p-4 space-y-3">
        {/* 系统提示词 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">系统:</span>
          <Input
            className="h-7 flex-1 text-xs bg-muted/50"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="设置系统提示词..."
          />
        </div>

        {/* 输入框 */}
        <div className="relative">
          <Textarea
            ref={inputRef}
            className="min-h-16 resize-none bg-transparent border-none shadow-none p-0 pr-10 text-sm"
            placeholder="输入消息… Ctrl+Enter 发送"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                send()
              }
            }}
          />
          {isGenerating && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Spinner className="size-3 text-primary" />
            </div>
          )}
        </div>

        {/* 底部栏 */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Ctrl+Enter 发送
          </span>
          {isGenerating ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-xl text-amber-600"
              onClick={stop}
            >
              <Square className="size-4" />
              停止
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-2 rounded-xl btn-warm"
              disabled={!input.trim() || isGenerating}
              onClick={send}
            >
              <Zap className="size-4" />
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const isEmpty = !message.content && message.isStreaming

  return (
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="size-4" />
        </div>
      )}

      <div
        className={`max-w-2xl rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground"
            : isError
              ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              : "bg-card/80"
        }`}
      >
        {isEmpty ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" />
            <span>正在思考<span className="cursor-blink">|</span></span>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <User className="size-4" />
        </div>
      )}
    </div>
  )
}

function currentPhaseLabel(phase: string): string {
  switch (phase) {
    case "loading-model":
      return "正在加载模型..."
    case "model-ready":
      return "模型就绪"
    case "preparing-request":
      return "正在准备请求..."
    case "starting-inference":
      return "正在推理..."
    case "cancelled":
      return "已取消"
    case "slow-first-token":
      return "响应较慢，请稍候..."
    default:
      return phase || "生成中..."
  }
}