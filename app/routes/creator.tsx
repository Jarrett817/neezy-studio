import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Circle,
  ImagePlus,
  Paperclip,
  Send,
  Square,
  User,
  Wand2,
  X,
  Zap,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { runContentAgent } from "~/agents/content-agent"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import { listenTauri } from "~/services/tauri-client"
import {
  cancelGeneration,
  getRuntimeMetrics,
  getRuntimeSettings,
  savePastedImage,
  type AgentExecutionStep,
  type ContentAgentOutput,
} from "~/services/workspace"
import { MarkdownContent } from "~/components/markdown-content"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  steps?: AgentExecutionStep[]
  trace?: ContentAgentOutput["trace"]
  isStreaming?: boolean
}

type AgentStreamEvent =
  | { type: "token"; text?: string }
  | { type: "status"; phase?: string; message?: string }

const STREAM_FLUSH_INTERVAL_MS = 48
const FIRST_TOKEN_WARN_MS = 5000

export default function CreatorRoute() {
  const [input, setInput] = useState("")
  const [imagePath, setImagePath] = useState("")
  const [imageName, setImageName] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSavingImage, setIsSavingImage] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentPhase, setCurrentPhase] = useState("")
  const [stepsExpanded, setStepsExpanded] = useState(true)
  const activeAssistantId = useRef<string | null>(null)
  const streamBufferRef = useRef("")
  const flushTimerRef = useRef<number | null>(null)
  const firstTokenTimerRef = useRef<number | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
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
          ? { ...item, content: mergeStreamText(item.content, buffered) }
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
    mutationFn: async (goal: string) =>
      runContentAgent(
        {
          topic: goal.slice(0, 80),
          goal,
          references: "",
          modelId: metrics?.recommendedModelId,
          imagePath: imagePath || undefined,
        },
        {
          onStepsChange: (steps) => {
            const activeId = activeAssistantId.current
            if (!activeId) return
            setMessages((items) =>
              items.map((item) =>
                item.id === activeId ? { ...item, steps } : item
              )
            )
          },
        }
      ),
    onSuccess: (output) => {
      setIsGenerating(false)
      setCurrentPhase("")
      const id = activeAssistantId.current
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushBufferedTokens(id)
      if (!id) return
      const assistantMsg = messages.find((m) => m.id === id)
      const finalContent =
        assistantMsg?.content.trim() ||
        `${output.title}\n\n${output.body}`.trim()
      setMessages((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, trace: output.trace, content: finalContent, isStreaming: false }
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
      const message =
        error instanceof Error ? error.message : "生成失败，请检查模型配置。"
      setMessages((items) => [
        ...items,
        { id: crypto.randomUUID(), role: "error", content: message },
      ])
      const activeId = activeAssistantId.current
      if (activeId) {
        setMessages((items) =>
          items.map((item) =>
            item.id === activeId
              ? {
                  ...item,
                  steps: (item.steps ?? []).map((step) =>
                    step.status === "running"
                      ? { ...step, status: "error", detail: message }
                      : step
                  ),
                  isStreaming: false,
                }
              : item
          )
        )
      }
      activeAssistantId.current = null
    },
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    listenTauri<AgentStreamEvent>("content-agent-event", (event) => {
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
                ? { ...item, steps: mergeRuntimeStatus(item.steps ?? [], phase ?? "runtime", message) }
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
    setStepsExpanded(true)
    setMessages((items) => [
      ...items,
      { id: userId, role: "user", content: imageName ? `${text}\n\n[图片: ${imageName}]` : text },
      { id: assistantId, role: "assistant", content: "", steps: [], isStreaming: true },
    ])
    firstTokenTimerRef.current = window.setTimeout(() => {
      const activeId = activeAssistantId.current
      if (!activeId) return
      setMessages((items) =>
        items.map((item) =>
          item.id === activeId
            ? {
                ...item,
                steps: mergeRuntimeStatus(
                  item.steps ?? [],
                  "slow-first-token",
                  "首个响应超过 5 秒，通常卡在模型加载或首轮推理。"
                ),
              }
            : item
        )
      )
    }, FIRST_TOKEN_WARN_MS)
    setInput("")
    mutation.mutate(text)
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
    const activeId = activeAssistantId.current
    if (activeId) {
      setMessages((items) =>
        items.map((item) =>
          item.id === activeId
            ? {
                ...item,
                steps: (item.steps ?? []).map((step) =>
                  step.status === "running"
                    ? { ...step, status: "skipped", detail: "用户已停止本轮生成" }
                    : step
                ),
                isStreaming: false,
              }
            : item
        )
      )
    }
    activeAssistantId.current = null
    mutation.reset()
  }

  const attachImageFile = async (file?: File | null) => {
    if (!file) return
    setIsSavingImage(true)
    try {
      const bytesBase64 = await fileToBase64(file)
      const savedPath = await savePastedImage({
        fileName: file.name,
        mimeType: file.type || "image/png",
        bytesBase64,
      })
      setImagePath(savedPath)
      setImageName(file.name || "已粘贴图片")
    } finally {
      setIsSavingImage(false)
    }
  }

  const enabledModelCount = settings?.models.filter((m) => m.enabled).length ?? 0

  return (
    <div className="flex h-[calc(100svh-80px)] flex-col gap-4">
      {/* 消息区 */}
      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={(text) => {
            setInput(text)
            setTimeout(() => inputRef.current?.focus(), 100)
          }} />
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                expanded={stepsExpanded}
                onToggleExpand={() => setStepsExpanded((v) => !v)}
              />
            ))}
            {/* 全局状态指示器 */}
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

      {/* 输入区 — 悬浮玻璃 */}
      <div className="relative">
        <div className="glass-warm rounded-2xl border border-border/10 p-4 space-y-3">
          {/* 图片预览 */}
          {imageName && (
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <p className="truncate text-sm font-medium">{imageName}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setImageName("")
                  setImagePath("")
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {/* 输入框 */}
          <div className="relative">
            <Textarea
              ref={inputRef}
              className="min-h-20 resize-none bg-transparent border-none shadow-none focus:ring-0 p-0 pr-10 text-base"
              placeholder="描述你想创作的内容，可以粘贴图片… Ctrl+Enter 发送"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={async (event) => {
                const imageItem = Array.from(event.clipboardData.items).find((item) =>
                  item.type.startsWith("image/")
                )
                if (!imageItem) return
                event.preventDefault()
                await attachImageFile(imageItem.getAsFile())
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  send()
                }
              }}
            />
            {isGenerating && (
              <div className="absolute right-2 top-2">
                <Circle className="size-3 text-primary animate-pulse" />
              </div>
            )}
          </div>

          {/* 底部栏 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 rounded-xl text-muted-foreground hover:text-foreground"
                disabled={isSavingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus className="size-4" />
                {isSavingImage ? "处理中..." : "添加图片"}
              </Button>
              <input
                ref={imageInputRef}
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => attachImageFile(event.target.files?.[0])}
              />
              {enabledModelCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {enabledModelCount} 个模型可用
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 rounded-xl text-amber-600 hover:text-amber-700"
                  onClick={stop}
                >
                  <Square className="size-4" />
                  停止
                </Button>
              ) : null}
              <Button
                size="sm"
                className="gap-2 rounded-xl btn-warm"
                disabled={!input.trim() || isGenerating || isSavingImage}
                onClick={send}
              >
                {isGenerating ? (
                  <>
                    <Spinner className="size-4" />
                    生成中
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    发送
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-16 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Wand2 className="size-8" />
      </div>
      <h3 className="font-display text-xl font-semibold">开始你的第一次创作</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        告诉 AI 你想写什么，它可以是你工作中的助理、客服、分析师
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {["帮我写一篇产品介绍", "总结这份文档要点", "分析用户反馈数据"].map(
          (suggestion) => (
            <button
              key={suggestion}
              className="rounded-full border border-border/50 bg-card/60 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground hover:bg-card"
              onClick={() => onSuggestionClick(suggestion)}
            >
              {suggestion}
            </button>
          )
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  expanded,
  onToggleExpand,
}: {
  message: ChatMessage
  expanded: boolean
  onToggleExpand: () => void
}) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const steps = message.steps
  const hasSteps = steps && steps.length > 0
  const allStepsDone = hasSteps && steps!.every(
    (s) => s.status === "done" || s.status === "skipped"
  )
  const isGenerating = !isUser && !isError && message.isStreaming

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
        {/* 执行步骤折叠面板 */}
        {!isUser && !isError && hasSteps && (
          <div className="mb-3">
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              <span>
                {isGenerating
                  ? "生成中..."
                  : allStepsDone
                    ? "已完成"
                    : "进行中"}
              </span>
              <span className="text-[10px] opacity-60">
                {steps!.filter((s) => s.status === "done").length}/
                {steps!.length} 步骤
              </span>
            </button>

            {expanded && (
              <div className="mt-2 space-y-1.5 border-l-2 border-primary/20 pl-3">
                {steps!.map((step) => (
                  <div key={step.key} className="flex items-start gap-2">
                    <StepIndicator status={step.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{step.label}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {statusLabel(step.status)}
                        </span>
                      </div>
                      {step.detail && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 内容区 */}
        <div className="whitespace-pre-wrap">
          {isGenerating && !message.content ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-4" />
              <span>正在思考<span className="cursor-blink">|</span></span>
            </div>
          ) : isUser ? (
            message.content
          ) : (
            message.content || "生成中..."
          )}
        </div>

        {/* Trace 信息 */}
        {!isUser && !isError && message.trace && (
          <div className="mt-3 border-t border-border/30 pt-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {message.trace.modelLabel && (
                <span className="rounded-full bg-muted/60 px-2 py-0.5">
                  {message.trace.modelLabel}
                </span>
              )}
              {message.trace.elapsedMs && (
                <span>用时 {formatElapsed(message.trace.elapsedMs)}</span>
              )}
              {message.trace.knowledgeUsed !== undefined && message.trace.knowledgeUsed > 0 && (
                <span>使用 {message.trace.knowledgeUsed} 条知识</span>
              )}
              {message.trace.skills && message.trace.skills.length > 0 && (
                <span>{message.trace.skills.length} 个技能</span>
              )}
            </div>
          </div>
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

function StepIndicator({ status }: { status: AgentExecutionStep["status"] }) {
  if (status === "running") {
    return <Circle className="size-3.5 mt-0.5 shrink-0 text-primary spin-warm" />
  }
  if (status === "done") {
    return (
      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] dark:bg-emerald-950/60 dark:text-emerald-400">
        ✓
      </span>
    )
  }
  if (status === "skipped") {
    return <span className="mt-0.5 text-[10px] text-muted-foreground">⏭</span>
  }
  if (status === "error") {
    return <span className="mt-0.5 text-[10px] text-red-500">✗</span>
  }
  return <span className="mt-0.5 size-3.5 shrink-0 rounded-full border border-border" />
}

function mergeStreamText(current: string, incoming: string) {
  if (!incoming) return current
  if (!current) return incoming
  if (current.endsWith(incoming)) return current
  if (incoming.endsWith(current)) return incoming
  if (incoming.startsWith(current)) return incoming
  const maxLen = Math.min(current.length, incoming.length)
  for (let len = maxLen; len > 0; len--) {
    if (current.endsWith(incoming.slice(0, len))) {
      return current + incoming.slice(len)
    }
    if (incoming.endsWith(current.slice(-len))) {
      return incoming + current.slice(len)
    }
  }
  return current + incoming
}

function mergeRuntimeStatus(steps: AgentExecutionStep[], phase: string, message: string) {
  const runtimeKey = `runtime-${phase}`
  const existing = steps.find((step) => step.key === runtimeKey)
  const nextStatus: AgentExecutionStep["status"] = phase === "cancelled" ? "skipped" : "running"
  if (existing) {
    return steps.map((step) =>
      step.key === runtimeKey ? { ...step, detail: message, status: nextStatus } : step
    )
  }
  return [...steps, { key: runtimeKey, label: runtimeLabel(phase), detail: message, status: nextStatus }]
}

function runtimeLabel(phase: string) {
  switch (phase) {
    case "loading-model": return "加载模型"
    case "model-ready": return "模型就绪"
    case "preparing-request": return "准备请求"
    case "starting-inference": return "开始推理"
    case "cancelled": return "已取消"
    case "slow-first-token": return "首响过慢"
    default: return "运行状态"
  }
}

function statusLabel(status: AgentExecutionStep["status"]) {
  switch (status) {
    case "running": return "进行中"
    case "done": return "完成"
    case "skipped": return "跳过"
    case "error": return "失败"
    default: return "等待"
  }
}

function formatElapsed(value: number) {
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function currentPhaseLabel(phase: string): string {
  switch (phase) {
    case "loading-model": return "正在加载模型..."
    case "model-ready": return "模型就绪"
    case "preparing-request": return "正在准备请求..."
    case "starting-inference": return "正在推理..."
    case "cancelled": return "已取消"
    case "slow-first-token": return "响应较慢，请稍候..."
    default: return phase || "生成中..."
  }
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}