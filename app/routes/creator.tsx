import { useMutation, useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Bot,
  Circle,
  ImagePlus,
  Paperclip,
  Send,
  Square,
  Trash2,
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
import { PageTransition, FadeIn } from "~/components/animation-effects"
import {
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

  const mutation = useMutation({
    mutationFn: async (goal: string) =>
      runContentAgent({
        topic: goal.slice(0, 80),
        goal,
        references: "",
        imagePath: imagePath || undefined,
      }),
    onSuccess: (output) => {
      setIsGenerating(false)
      setCurrentPhase("")
      setMessages((items) =>
        items.map((item) =>
          item.isStreaming
            ? { ...item, trace: output.trace, content: `${output.title}\n\n${output.body}`, isStreaming: false }
            : item
        )
      )
    },
    onError: (error) => {
      setIsGenerating(false)
      setCurrentPhase("")
      const message = error instanceof Error ? error.message : "生成失败，请检查模型配置。"
      setMessages((items) => [
        ...items.map((item) =>
          item.isStreaming ? { ...item, content: message, isStreaming: false } : item
        ),
      ])
    },
  })

  const handleImageUpload = async (file: File) => {
    setIsSavingImage(true)
    try {
      const savedPath = await savePastedImage({
        fileName: file.name,
        mimeType: file.type,
        bytesBase64: await fileToBase64(file),
      })
      setImagePath(savedPath)
      setImageName(file.name || "已粘贴图片")
    } finally {
      setIsSavingImage(false)
    }
  }

  const stop = () => {
    setIsGenerating(false)
    setCurrentPhase("已停止")
    setMessages((items) =>
      items.map((item) => (item.isStreaming ? { ...item, isStreaming: false } : item))
    )
    mutation.reset()
  }

  const send = () => {
    const text = input.trim()
    if (!text || mutation.isPending) return
    setIsGenerating(true)
    setCurrentPhase("正在思考...")
    setMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: crypto.randomUUID(), role: "assistant", content: "", isStreaming: true, steps: [] },
    ])
    setInput("")
    mutation.mutate(text)
  }

  const clearChat = () => setMessages([])

  return (
    <PageTransition>
      <div className="flex flex-col h-full min-h-0">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wand2 className="size-4" />
            </div>
            <span className="text-sm font-semibold">创作助手</span>
            {settings?.ollamaModel && (
              <span className="text-xs text-muted-foreground">· {settings.ollamaModel}</span>
            )}
          </div>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs rounded-xl" onClick={clearChat}>
                <Trash2 className="size-3" />
                清空
              </Button>
            )}
          </div>
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
                <Wand2 className="size-12 text-muted-foreground/30 mb-4" />
              </motion.div>
              <h3 className="font-display text-lg font-semibold">AI 创作助手</h3>
              <p className="mt-1 text-sm text-muted-foreground">输入主题，让 AI 为你创作内容</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <MessageBubble message={message} />
                </motion.div>
              ))}
            </div>
          )}
          {isGenerating && currentPhase && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4">
              <Spinner className="size-4 text-primary" />
              <span className="text-xs text-muted-foreground">{currentPhase}</span>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="shrink-0 glass-warm rounded-2xl border border-border/10 p-4 space-y-3 mt-2">
          {/* 图片预览 */}
          {imagePath && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Paperclip className="size-3" />
              <span>{imageName}</span>
              <button onClick={() => setImagePath("")} className="hover:text-foreground">
                <X className="size-3" />
              </button>
            </div>
          )}

          {/* 快捷输入 */}
          <div className="flex gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
                e.currentTarget.value = ""
              }}
            />
            <Button variant="ghost" size="icon" onClick={() => imageInputRef.current?.click()} disabled={isSavingImage}>
              <ImagePlus className="size-4" />
            </Button>
            <Input
              className="flex-1 bg-muted/50"
              placeholder="输入创作主题..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
          </div>

          {/* 发送栏 */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Enter 发送 · Shift+Enter 换行</span>
            {isGenerating ? (
              <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-amber-600" onClick={stop}>
                <Square className="size-4" />
                停止
              </Button>
            ) : (
              <Button size="sm" className="gap-2 rounded-xl btn-warm" disabled={!input.trim()} onClick={send}>
                <Zap className="size-4" />
                生成
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
            <span>正在生成<span className="cursor-blink">|</span></span>
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

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    "写一篇关于职场成长的文章",
    "帮我创作一个小红书爆款标题",
    "写一段产品介绍文案",
  ]
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Wand2 className="size-12 text-muted-foreground/30 mb-4" />
      <h3 className="font-display text-lg font-semibold">AI 创作助手</h3>
      <p className="mt-1 text-sm text-muted-foreground">输入主题，让 AI 为你创作内容</p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestionClick(s)}
            className="rounded-full bg-card/60 px-4 py-2 text-xs text-muted-foreground hover:bg-card hover:text-foreground transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function mergeStreamText(existing: string, buffered: string): string {
  return existing + buffered
}