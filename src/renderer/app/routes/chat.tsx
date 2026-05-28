import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Bot,
  MoreHorizontal,
  Paperclip,
  Square,
  Trash2,
  User,
  Zap,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { ChatModelStatus } from "~/components/chat/chat-model-status"
import { ChatSessionSidebar } from "~/components/chat/chat-session-sidebar"
import { ModelThinkingBlock } from "~/components/chat/model-thinking-block"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { MarkdownContent } from "~/components/markdown-content"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import { Label } from "~/components/ui/label"
import { Input } from "~/components/ui/input"
import { listSkills } from "~/services/workspace"
import { usePiAgentChat } from "~/hooks/use-pi-agent-chat"
import { getCurrentModel } from "~/services/llm"
import { getRuntimeSettings } from "~/services/settings"
import { useAppStore, type ChatMessage } from "~/stores/app-store"
import { upsertChatMessage, deleteChatMessagesForSession } from "~/services/storage/chat-messages"
import {
  ensureActiveChatSession,
  loadChatSessionMessages,
  setActiveSessionId as persistActiveSessionId,
} from "~/services/storage/chat-history"
import { updateSession } from "~/services/storage/sessions"
import { addConversationSlice } from "~/services/storage/memory-vectors"
import { rememberConversationTurn } from "~/services/memory-profile"
import {
  getPortraitContextForPrompt,
  updatePortraitFromConversation,
} from "~/services/user-portrait"
import { appendModelReplyHints, parseModelThinking } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

const SYSTEM_PROMPT =
  `你是 Neezy Studio 中的对话助手。回答用中文，语气清晰自然。已注册工具：memory_search、memory_add、memory_event、datetime、calculator；需要时请直接调用工具。`.trim()

export default function ChatRoute() {
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const [attachedFile, setAttachedFile] = useState<{
    name: string
    content: string
  } | null>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const activeAssistantId = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsReady, setSessionsReady] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  const messages = useAppStore((state) => state.conversationHistory)
  const addMessage = useAppStore((state) => state.addMessage)
  const updateMessage = useAppStore((state) => state.updateMessage)
  const setConversationHistory = useAppStore((state) => state.setConversationHistory)
  const clearConversation = useAppStore((state) => state.clearConversation)
  const getMessage = useCallback(
    (id: string) =>
      useAppStore.getState().conversationHistory.find((m) => m.id === id),
    []
  )

  const persistMessage = useCallback((message: ChatMessage) => {
    const sid = sessionIdRef.current
    if (!sid) return
    void upsertChatMessage(sid, message).catch((err) =>
      console.warn("[chat] persist message failed:", err)
    )
  }, [])

  const addMessagePersist = useCallback(
    (msg: Omit<ChatMessage, "timestamp">) => {
      addMessage(msg)
      const full: ChatMessage = { ...msg, timestamp: Date.now() }
      persistMessage(full)
      return full
    },
    [addMessage, persistMessage]
  )

  const updateMessagePersist = useCallback(
    (id: string, updates: Partial<ChatMessage>) => {
      updateMessage(id, updates)
      const current = useAppStore.getState().conversationHistory.find((m) => m.id === id)
      if (current) persistMessage({ ...current, ...updates })
    },
    [updateMessage, persistMessage]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await ensureActiveChatSession()
        if (cancelled) return
        sessionIdRef.current = session.id
        setActiveSessionId(session.id)
        const loaded = await loadChatSessionMessages(session.id)
        if (cancelled) return
        setConversationHistory(loaded)
      } catch (err) {
        console.warn("[chat] load sessions failed:", err)
      } finally {
        if (!cancelled) setSessionsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setConversationHistory])

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })

  const enabledSkills = skills.filter((s) => s.enabled)
  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const agentSystemPrompt =
    activeSkill != null
      ? `${SYSTEM_PROMPT}\n\n当前技能: ${activeSkill}`
      : SYSTEM_PROMPT

  const { runPrompt, abort: abortPiAgent, resetAgent } = usePiAgentChat({
    systemPrompt: agentSystemPrompt,
    messages,
    enabled: sessionsReady,
  })

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current) return
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      await persistActiveSessionId(sessionId)
      const loaded = await loadChatSessionMessages(sessionId)
      setConversationHistory(loaded)
      await resetAgent().catch(() => {})
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
    [setConversationHistory, queryClient, resetAgent]
  )

  const handleNewSession = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      clearConversation()
      await resetAgent().catch(() => {})
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
    [clearConversation, queryClient, resetAgent]
  )

  const chatModelName =
    runtimeSettings?.llmProvider.kind === "openai-compatible"
      ? runtimeSettings.llmProvider.model.trim() || "API"
      : getCurrentModel() || runtimeSettings?.llmModel || "本地模型"

  const readFileContent = async (file: File): Promise<string> => {
    const MAX_CHUNK_SIZE = 32000
    const text = await file.text()
    if (text.length <= MAX_CHUNK_SIZE) return text
    const half = Math.floor(text.length / 2)
    const firstChunk = text.slice(0, MAX_CHUNK_SIZE / 2)
    const secondChunk = text.slice(half + MAX_CHUNK_SIZE / 2 - text.length)
    return `${firstChunk}\n...\n(内容过长，已截断中间部分)\n...\n${secondChunk}`
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsReadingFile(true)
    try {
      const content = await readFileContent(file)
      setAttachedFile({ name: file.name, content })
      toast.success(`已附加 ${file.name}`)
    } catch {
      toast.error("读取文件失败")
    } finally {
      setIsReadingFile(false)
    }
    e.target.value = ""
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const patchAssistant = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      updateMessagePersist(id, patch)
    },
    [updateMessagePersist]
  )

  const send = useCallback(async () => {
    const text = input.trim()
    const hasText = text.length > 0
    const hasFile = attachedFile !== null
    if ((!hasText && !hasFile) || isGenerating) return

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId

    let userContent = text
    if (attachedFile) {
      userContent = hasText
        ? `${text}\n\n[附件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`
        : `[附件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`
    }

    setInput("")
    setIsGenerating(true)
    setAttachedFile(null)

    addMessagePersist({
      id: userId,
      role: "user",
      content: hasText ? userContent : `[文件] ${attachedFile?.name}`,
      thinking: "",
    })
    addMessagePersist({
      id: assistantId,
      role: "assistant",
      content: "",
      thinking: "",
      isStreaming: true,
      toolCalls: [],
    })

    const modelFile = getCurrentModel()
    try {
      let portraitContext = ""
      await getPortraitContextForPrompt().then((ctx) => {
        portraitContext = ctx
      })

      const userForAgent = appendModelReplyHints(
        portraitContext ? `${userContent}\n${portraitContext}` : userContent,
        modelFile
      )

      const result = await runPrompt({
        userMessage: userForAgent,
        assistantId,
        onStream: ({ thinking, content }) => {
          patchAssistant(assistantId, { thinking, content })
        },
        onToolCall: (name, args, toolResult) => {
          const current = getMessage(assistantId)
          patchAssistant(assistantId, {
            toolCalls: [
              ...(current?.toolCalls || []),
              { name, args, result: toolResult },
            ],
          })
        },
      })

      const parsed = parseModelThinking(result.content)
      const finalThinking =
        getMessage(assistantId)?.thinking?.trim() ||
        result.thinking ||
        parsed.thinking
      const finalContent = parsed.visible || result.content

      if (!finalContent.trim()) {
        patchAssistant(assistantId, { isStreaming: false })
        toast.error("模型未返回内容，请检查连接或模型是否已启动")
        return
      }

      patchAssistant(assistantId, {
        content: finalContent,
        thinking: finalThinking,
        isStreaming: false,
      })

      if (text || attachedFile) {
        updatePortraitFromConversation({
          userContent,
          assistantContent: finalContent,
        })
          .then(() =>
            queryClient.invalidateQueries({ queryKey: ["user-portrait"] })
          )
          .catch((err) => console.warn("[portrait] update failed:", err))
        rememberConversationTurn({
          userContent,
          assistantContent: finalContent,
        }).catch((err) => console.warn("[memory] remember failed:", err))
        addConversationSlice(assistantId, userContent).catch((err) => {
          console.warn("Failed to save conversation slice:", err)
        })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "生成失败"
      patchAssistant(assistantId, { isStreaming: false })
      addMessagePersist({
        id: crypto.randomUUID(),
        role: "error",
        content: message,
        thinking: "",
      })
      toast.error(message)
    } finally {
      setIsGenerating(false)
      activeAssistantId.current = null
    }
  }, [
    input,
    isGenerating,
    messages,
    attachedFile,
    addMessagePersist,
    patchAssistant,
    getMessage,
    queryClient,
    runPrompt,
  ])

  const stop = useCallback(() => {
    const id = activeAssistantId.current
    if (id) {
      patchAssistant(id, { isStreaming: false })
    }
    abortPiAgent()
    setIsGenerating(false)
    activeAssistantId.current = null
  }, [patchAssistant, abortPiAgent])

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")

  if (!sessionsReady) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        加载对话历史…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <ChatSessionSidebar
        activeSessionId={activeSessionId}
        onSelectSession={(id) => void handleSelectSession(id)}
        onSessionCreated={(id) => void handleNewSession(id)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/10 px-1 pb-3 pt-1">
          <ChatModelStatus className="min-w-0 flex-1" />
          <div className="flex shrink-0 items-center gap-1">
            <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-full"
                  aria-label="对话选项"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>对话选项</SheetTitle>
                  <SheetDescription>模型参数、Skill 与工具 trace</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6 px-1">
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="chat-temperature">Temperature</Label>
                      <Input
                        id="chat-temperature"
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(e) => setTemperature(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="chat-max-tokens">Max tokens</Label>
                      <Input
                        id="chat-max-tokens"
                        type="number"
                        min={256}
                        max={8192}
                        step={256}
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  {enabledSkills.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Skill</p>
                      <div className="flex flex-wrap gap-1.5">
                        {enabledSkills.map((skill) => (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() =>
                              setActiveSkill((prev) =>
                                prev === skill.name ? null : skill.name
                              )
                            }
                            className={cn(
                              "rounded-full px-3 py-1 text-xs transition-colors",
                              activeSkill === skill.name
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {skill.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">工具 trace</p>
                    {lastAssistant?.toolCalls?.length ? (
                      <ul className="space-y-2 text-xs">
                        {lastAssistant.toolCalls.map((tc, i) => (
                          <li
                            key={`${tc.name}-${i}`}
                            className="rounded-xl border border-border/60 bg-muted/30 p-2 font-mono"
                          >
                            {tc.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">暂无工具调用记录</p>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            {messages.length > 0 ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full text-muted-foreground"
                onClick={() => {
                  const sid = sessionIdRef.current
                  clearConversation()
                  resetAgent().catch(() => {})
                  if (sid) {
                    void deleteChatMessagesForSession(sid)
                    void updateSession(sid, {
                      message_count: 0,
                      last_message_preview: null,
                      title: "新对话",
                    })
                    void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
                  }
                }}
                aria-label="清空对话"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-primary/10 shadow-sm">
                <Sparkles className="size-9 text-primary" />
              </div>
              <p className="text-xl font-semibold tracking-tight">说说你想做什么</p>
            </div>
          ) : (
            <div className="space-y-5 pb-4">
              {messages.map((message) => (
                <div key={message.id}>
                  <MessageBubble message={message} modelName={chatModelName} />
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-3 shrink-0 rounded-2xl border border-border/15 bg-card shadow-sm">
          {attachedFile && (
            <div className="flex items-center gap-2 border-b border-border/10 px-3 py-2">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="flex-1 truncate text-xs">
                {attachedFile.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                onClick={() => setAttachedFile(null)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}

          <Textarea
            className="min-h-[52px] resize-none rounded-none border-0 bg-transparent px-3 py-3 text-sm leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0"
            placeholder="输入消息…"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send()
            }}
          />

          <div className="flex items-center justify-between gap-2 border-t border-border/10 px-2 py-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || isReadingFile}
              aria-label="附加文件"
            >
              {isReadingFile ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
            </Button>

            {isGenerating ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full border-amber-200/80 text-amber-700 dark:border-amber-800 dark:text-amber-300"
                onClick={stop}
              >
                <Square className="size-3.5 fill-current" />
                停止
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-2 rounded-full px-5"
                disabled={!input.trim() && !attachedFile}
                onClick={send}
              >
                <Zap className="size-4" />
                发送
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  modelName,
}: {
  message: ChatMessage
  modelName: string
}) {
  const isUser = message.role === "user"
  const isError = message.role === "error"
  const hasAnswer = Boolean(message.content?.trim())
  const hasThinkingText = Boolean(message.thinking?.trim())
  const showThinking =
    message.role === "assistant" &&
    (hasThinkingText ||
      Boolean(message.toolCalls?.length) ||
      (Boolean(message.isStreaming) && !hasAnswer))

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          "max-w-[min(100%,42rem)] min-w-0",
          isUser ? "items-end" : "items-start"
        )}
      >
        {isUser ? (
          <div className="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ) : isError ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {message.content}
          </div>
        ) : (
          <div className="space-y-3">
            {showThinking && (
              <ModelThinkingBlock
                modelName={modelName}
                thinking={message.thinking ?? ""}
                isStreaming={Boolean(message.isStreaming)}
                hasAnswerContent={hasAnswer}
                toolCalls={message.toolCalls}
              />
            )}

            {hasAnswer ? (
              <div className="rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-3.5 text-sm leading-relaxed shadow-sm">
                <MarkdownContent content={message.content} />
              </div>
            ) : message.isStreaming && !showThinking ? (
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                <span>正在生成…</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
