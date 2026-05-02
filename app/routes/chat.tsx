import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Bot,
  MessageSquare,
  Square,
  Trash2,
  User,
  Zap,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import { PageTransition } from "~/components/animation-effects"
import {
  chatWithOllama,
  getRuntimeSettings,
  type LlmMessage,
} from "~/services/workspace"
import { MarkdownContent } from "~/components/markdown-content"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
}

const FIRST_TOKEN_WARN_MS = 5000

export default function ChatRoute() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentPhase, setCurrentPhase] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("你是一个温暖、专业的助手。")
  const activeAssistantId = useRef<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const firstTokenTimerRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, currentPhase])

  const stop = useCallback(() => {
    abortRef.current?.()
    setIsGenerating(false)
    setCurrentPhase("已停止")
    if (firstTokenTimerRef.current !== null) {
      window.clearTimeout(firstTokenTimerRef.current)
      firstTokenTimerRef.current = null
    }
    setMessages((items) =>
      items.map((item) =>
        item.id === activeAssistantId.current
          ? { ...item }
          : item
      )
    )
    activeAssistantId.current = null
  }, [])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || isGenerating) return

    activeAssistantId.current = null
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId

    setIsGenerating(true)
    setCurrentPhase("正在思考...")

    setMessages((items) => [
      ...items,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", thinking: "" },
    ])

    firstTokenTimerRef.current = window.setTimeout(() => {
      const activeId = activeAssistantId.current
      if (!activeId) return
      setMessages((items) =>
        items.map((item) =>
          item.id === activeId
            ? { ...item, content: item.content + "\n\n**[慢]** 首个响应超过 5 秒，模型可能在加载中..." }
            : item
        )
      )
    }, FIRST_TOKEN_WARN_MS)

    setInput("")

    const conversationMessages: LlmMessage[] = [
      ...messages.filter((m) => m.role !== "error"),
      { id: userId, role: "user" as const, content: text },
    ]

    const model = settings?.ollamaModel || "qwen3:1.7b"

    chatWithOllama({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      onChunk: (content, thinking) => {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content, thinking }
              : item
          )
        )
      },
    })
      .then(({ content, thinking }) => {
        window.clearTimeout(firstTokenTimerRef.current ?? undefined)
        firstTokenTimerRef.current = null
        setIsGenerating(false)
        setCurrentPhase("")
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: content || item.content, thinking: thinking || item.thinking }
              : item
          )
        )
        activeAssistantId.current = null
      })
      .catch((error) => {
        window.clearTimeout(firstTokenTimerRef.current ?? undefined)
        firstTokenTimerRef.current = null
        setIsGenerating(false)
        setCurrentPhase("")
        setMessages((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: "error",
            content: error instanceof Error ? error.message : "生成失败",
          },
        ])
        activeAssistantId.current = null
      })
  }, [input, isGenerating, messages, settings?.ollamaModel, systemPrompt])

  const clearChat = () => setMessages([])

  return (
    <PageTransition>
      <div className="flex flex-col h-full min-h-0">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="size-4" />
            </div>
            <span className="text-sm font-semibold">模型对话</span>
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
        <div className="flex-1 min-h-0 overflow-y-auto">
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full flex-col items-center justify-center py-16 text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Bot className="size-12 text-muted-foreground/30 mb-4" />
              </motion.div>
              <h3 className="font-display text-lg font-semibold">直接对话模型</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                直接测试 LLM 对话能力
              </p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <MessageBubble message={message} />
                </motion.div>
              ))}
            </div>
          )}
          {/* 流式状态指示器 */}
          {isGenerating && currentPhase && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 px-4"
            >
              <Spinner className="size-4 text-primary" />
              <span className="text-xs text-muted-foreground">{currentPhase}</span>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="shrink-0 glass-warm rounded-2xl border border-border/10 p-4 space-y-3 mt-2">
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
            <span className="text-[10px] text-muted-foreground">Ctrl+Enter 发送</span>
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
                disabled={!input.trim()}
                onClick={send}
              >
                <Zap className="size-4" />
                发送
              </Button>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const isEmpty = !message.content && message.role === "assistant"

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
            <span>正在生成<span className="cursor-blink">|</span></span>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <>
            {message.thinking && (
              <details className="mb-2" open>
                <summary className="text-xs text-muted-foreground/60 cursor-pointer mb-1">思考过程</summary>
                <div className="text-xs text-muted-foreground/60 whitespace-pre-wrap">{message.thinking}</div>
              </details>
            )}
            <MarkdownContent content={message.content} />
          </>
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