import { useMutation, useQuery } from "@tanstack/react-query"
import { listen } from "@tauri-apps/api/event"
import {
  Bot,
  Cpu,
  ImagePlus,
  Send,
  Square,
  User,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { runContentAgent } from "~/agents/content-agent"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  cancelGeneration,
  getRuntimeMetrics,
  getRuntimeSettings,
  savePastedImage,
  type AgentExecutionStep,
} from "~/services/workspace"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
}

type AgentStreamEvent = { type: "token"; text?: string }
const STREAM_FLUSH_INTERVAL_MS = 48

export default function CreatorRoute() {
  const [input, setInput] = useState("")
  const [imagePath, setImagePath] = useState("")
  const [imageName, setImageName] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [steps, setSteps] = useState<AgentExecutionStep[]>([])
  const [isSavingImage, setIsSavingImage] = useState(false)
  const activeAssistantId = useRef<string | null>(null)
  const streamBufferRef = useRef("")
  const flushTimerRef = useRef<number | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

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
        { onStepsChange: setSteps }
      ),
    onSuccess: (output) => {
      const id = activeAssistantId.current
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushBufferedTokens(id)
      if (!id) return
      setMessages((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                content:
                  item.content.trim() ||
                  `${output.title}\n\n${output.body}`.trim(),
              }
            : item
        )
      )
      activeAssistantId.current = null
    },
    onError: (error) => {
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
      setSteps((items) =>
        items.map((item) =>
          item.status === "running"
            ? { ...item, status: "error", detail: message }
            : item
        )
      )
      activeAssistantId.current = null
    },
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    listen<AgentStreamEvent>("content-agent-event", (event) => {
      const activeId = activeAssistantId.current
      const token = event.payload.text
      if (!activeId || event.payload.type !== "token" || !token) return

      streamBufferRef.current = `${streamBufferRef.current}${token}`
      scheduleFlush()
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
    setMessages((items) => [
      ...items,
      {
        id: userId,
        role: "user",
        content: imageName ? `${text}\n\n图片: ${imageName}` : text,
      },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setInput("")
    mutation.mutate(text)
  }

  const stop = async () => {
    await cancelGeneration()
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flushBufferedTokens()
    setSteps((items) =>
      items.map((item) =>
        item.status === "running"
          ? { ...item, status: "skipped", detail: "用户已停止本轮生成" }
          : item
      )
    )
    activeAssistantId.current = null
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

  return (
    <div className="flex h-[calc(100svh-120px)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-base font-semibold">Agent 对话</h1>
          <p className="text-sm text-muted-foreground">
            已启用模型 {settings?.models.filter((model) => model.enabled).length ?? 0} 个
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          <Cpu className="size-4" />
          {metrics?.recommendedModelId ?? "未选择模型"} · {metrics?.pressure ?? "--"}
        </div>
      </div>

      <ExecutionPanel steps={steps} />

      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            直接粘贴图片到输入框，或点“添加图片”上传。发送后会显示执行步骤。
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      <div className="grid gap-2 border-t border-border pt-3">
        <input
          ref={imageInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={(event) => attachImageFile(event.target.files?.[0])}
        />

        {imageName ? (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{imageName}</p>
              <p className="truncate text-xs text-muted-foreground">{imagePath}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setImageName("")
                setImagePath("")
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}

        <Textarea
          className="min-h-28 resize-none"
          placeholder="输入需求，直接粘贴图片到这里。Ctrl/Cmd + Enter 发送"
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={isSavingImage}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {isSavingImage ? "处理中..." : "添加图片"}
            </Button>
            <p className="text-xs text-muted-foreground">
              支持粘贴截图，不用再手填路径。
            </p>
          </div>
          <div className="flex justify-end gap-2">
            {mutation.isPending ? (
              <Button variant="outline" className="gap-2" onClick={stop}>
                <Square className="size-4" />
                停止
              </Button>
            ) : null}
            <Button
              className="gap-2"
              disabled={!input.trim() || mutation.isPending || isSavingImage}
              onClick={send}
            >
              <Send className="size-4" />
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExecutionPanel({ steps }: { steps: AgentExecutionStep[] }) {
  if (!steps.length) return null

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-2 xl:grid-cols-5">
      {steps.map((step) => (
        <div
          key={step.key}
          className={`rounded-md border px-3 py-2 text-sm ${
            step.status === "running"
              ? "border-primary/40 bg-primary/5"
              : step.status === "done"
                ? "border-border bg-muted/40"
                : step.status === "error"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/70"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{step.label}</p>
            <span className="text-xs text-muted-foreground">
              {statusLabel(step.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
          {step.elapsedMs ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {formatElapsed(step.elapsedMs)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function mergeStreamText(current: string, incoming: string) {
  if (!incoming) return current
  if (!current) return incoming
  if (current.endsWith(incoming)) return current
  if (incoming.startsWith(current)) return incoming

  const overlap = Math.min(current.length, incoming.length)
  for (let size = overlap; size > 0; size -= 1) {
    if (current.slice(-size) === incoming.slice(0, size)) {
      return `${current}${incoming.slice(size)}`
    }
  }

  return `${current}${incoming}`
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const Icon = isUser ? User : Bot
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" />
        </div>
      ) : null}
      <div
        className={`max-w-3xl whitespace-pre-wrap rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : isError
              ? "border border-destructive/40 text-destructive"
              : "border border-border"
        }`}
      >
        {message.content || "生成中..."}
      </div>
      {isUser ? (
        <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" />
        </div>
      ) : null}
    </div>
  )
}

function statusLabel(status: AgentExecutionStep["status"]) {
  switch (status) {
    case "running":
      return "进行中"
    case "done":
      return "完成"
    case "skipped":
      return "跳过"
    case "error":
      return "失败"
    default:
      return "等待"
  }
}

function formatElapsed(value: number) {
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
