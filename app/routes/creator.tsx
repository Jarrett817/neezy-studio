import { useMutation, useQuery } from "@tanstack/react-query"
import { listen } from "@tauri-apps/api/event"
import { Bot, Cpu, Send, Square, User } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { runContentAgent } from "~/agents/content-agent"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  cancelGeneration,
  getRuntimeMetrics,
  getRuntimeSettings,
} from "~/services/workspace"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
}

type AgentStreamEvent = { type: "token"; text?: string }

export default function CreatorRoute() {
  const [input, setInput] = useState("")
  const [imagePath, setImagePath] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const activeAssistantId = useRef<string | null>(null)

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    refetchInterval: 3000,
  })

  const mutation = useMutation({
    mutationFn: runContentAgent,
    onSuccess: (output) => {
      const id = activeAssistantId.current
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
      const message =
        error instanceof Error ? error.message : "生成失败，请检查模型配置。"
      setMessages((items) => [
        ...items,
        { id: crypto.randomUUID(), role: "error", content: message },
      ])
      activeAssistantId.current = null
    },
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<AgentStreamEvent>("content-agent-event", (event) => {
      const activeId = activeAssistantId.current
      const token = event.payload.text
      if (!activeId || event.payload.type !== "token" || !token) return
      setMessages((items) =>
        items.map((item) =>
          item.id === activeId
            ? { ...item, content: `${item.content}${token}` }
            : item
        )
      )
    }).then((handler) => {
      unlisten = handler
    })
    return () => unlisten?.()
  }, [])

  const send = () => {
    const text = input.trim()
    if (!text || mutation.isPending) return
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId
    setMessages((items) => [
      ...items,
      {
        id: userId,
        role: "user",
        content: imagePath.trim() ? `${text}\n\n图片：${imagePath.trim()}` : text,
      },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setInput("")
    mutation.mutate({
      topic: text.slice(0, 80),
      goal: text,
      references: "",
      modelId: metrics?.recommendedModelId,
      imagePath: imagePath.trim() || undefined,
    })
  }

  const stop = async () => {
    await cancelGeneration()
    activeAssistantId.current = null
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
          {metrics?.recommendedModelId ?? "未选择模型"} ·{" "}
          {metrics?.pressure ?? "--"}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            输入需求后发送。可选图片路径会交给视觉模型链路处理。
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      <div className="grid gap-2 border-t border-border pt-3">
        <Input
          placeholder="图片路径，可选"
          value={imagePath}
          onChange={(event) => setImagePath(event.target.value)}
        />
        <Textarea
          className="min-h-24 resize-none"
          placeholder="输入需求，Ctrl/⌘ + Enter 发送"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              send()
            }
          }}
        />
        <div className="flex justify-end gap-2">
          {mutation.isPending ? (
            <Button variant="outline" className="gap-2" onClick={stop}>
              <Square className="size-4" />
              停止
            </Button>
          ) : null}
          <Button
            className="gap-2"
            disabled={!input.trim() || mutation.isPending}
            onClick={send}
          >
            <Send className="size-4" />
            发送
          </Button>
        </div>
      </div>
    </div>
  )
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
