import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import {
  MoreHorizontal,
  Paperclip,
  Square,
  Trash2,
  Zap,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { ChatModelStatus } from "~/components/chat/chat-model-status"
import { ChatTierPicker } from "~/components/chat/chat-tier-picker"
import { ChatSessionSidebar } from "~/components/chat/chat-session-sidebar"
import { ChatMessageBubble } from "~/components/chat/chat-message"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
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
import { entryDisplayName } from "~/config/chat-models"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
} from "~/services/settings"
import { useAppStore, type ChatMessage } from "~/stores/app-store"
import { ensureDbReady } from "~/services/db"
import {
  ensurePiChatSessionForSend,
  getActiveSessionId,
  loadActivePiChatSession,
  loadPiChatSessionById,
  loadPiChatMessages,
  pruneEmptyPiChatSessions,
  reconcileActivePiSession,
  removePiChatSession,
  setActiveSessionId as persistActiveSessionId,
  startNewPiChatSession,
} from "~/services/pi-chat-sessions"
import { clearActiveChatSessionId } from "~/services/storage/app-kv"
import { addConversationSlice } from "~/services/storage/memory-vectors"
import { rememberConversationTurn } from "~/services/memory-profile"
import {
  getPortraitContextForPrompt,
  updatePortraitFromConversation,
} from "~/services/user-portrait"
import { appendModelReplyHints, parseModelThinking } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

const SYSTEM_PROMPT =
  `你是 Neezy Studio 中的对话助手。回答用中文，语气清晰自然。已注册工具：memory_search、memory_add、memory_event，以及 Pi 内置文件/命令工具；需要时请直接调用。`.trim()

const CHAT_SCROLL_NEAR_BOTTOM_PX = 80

function isChatNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= CHAT_SCROLL_NEAR_BOTTOM_PX
}

export default function ChatRoute() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const sessionFromUrl = searchParams.get("session")?.trim() || null
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const armStickToBottom = useCallback(() => {
    stickToBottomRef.current = true
  }, [])

  const scrollChatToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const onMessagesScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    stickToBottomRef.current = isChatNearBottom(el)
  }, [])

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

  const syncFromDisk = useCallback(
    (diskMessages: ChatMessage[]) => {
      const prev = useAppStore.getState().conversationHistory
      const prevAssistants = prev.filter((m) => m.role === "assistant")
      let assistantIdx = 0
      const merged = diskMessages.map((dm) => {
        if (dm.role !== "assistant") return dm
        const keep = prevAssistants[assistantIdx]
        assistantIdx += 1
        if (!keep) return dm
        return {
          ...dm,
          agentSteps: keep.agentSteps?.length ? keep.agentSteps : dm.agentSteps,
          toolCalls: keep.toolCalls?.length ? keep.toolCalls : dm.toolCalls,
          usageSummary: keep.usageSummary ?? dm.usageSummary,
          thinking: keep.thinking?.trim() ? keep.thinking : dm.thinking,
        }
      })
      setConversationHistory(merged)
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
      void queryClient.invalidateQueries({
        queryKey: ["chat-sessions", "with-messages"],
      })
    },
    [setConversationHistory, queryClient]
  )

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
    diskSessionId: activeSessionId,
    enabled: sessionsReady && Boolean(activeSessionId),
    onDiskMessagesReload: syncFromDisk,
    onDiskSessionIdRebound: (id) => {
      sessionIdRef.current = id
      setActiveSessionId(id)
      void persistActiveSessionId(id)
    },
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureDbReady()
        await reconcileActivePiSession()
        const keepId = sessionFromUrl ?? (await getActiveSessionId())
        await pruneEmptyPiChatSessions(keepId)

        const loaded = sessionFromUrl
          ? await loadPiChatSessionById(sessionFromUrl)
          : await loadActivePiChatSession()

        if (cancelled) return
        if (loaded.session && loaded.messages.length > 0) {
          sessionIdRef.current = loaded.session.id
          setActiveSessionId(loaded.session.id)
          await persistActiveSessionId(loaded.session.id)
          armStickToBottom()
          setConversationHistory(loaded.messages)
        } else {
          sessionIdRef.current = null
          setActiveSessionId(null)
          await clearActiveChatSessionId().catch(() => {})
          clearConversation()
        }
        void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
        void queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
        void queryClient.invalidateQueries({
          queryKey: ["chat-sessions", "with-messages"],
        })
      } catch (err) {
        console.warn("[chat] load sessions failed:", err)
      } finally {
        if (!cancelled) setSessionsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setConversationHistory, clearConversation, sessionFromUrl, queryClient, armStickToBottom])

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current) return
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      await persistActiveSessionId(sessionId)
      const loaded = await loadPiChatMessages(sessionId)
      await resetAgent([], sessionId).catch((err) =>
        console.warn("[chat] reset agent failed:", err)
      )
      armStickToBottom()
      setConversationHistory(loaded)
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
    [setConversationHistory, queryClient, resetAgent, armStickToBottom]
  )

  const handleNewSession = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      await persistActiveSessionId(sessionId)
      clearConversation()
      await resetAgent([], sessionId).catch((err) =>
        console.warn("[chat] reset agent failed:", err)
      )
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
    [clearConversation, queryClient, resetAgent]
  )

  const chatEntry = runtimeSettings
    ? resolveChatModelEntry(runtimeSettings, input.trim() || undefined)
    : null
  const chatModelName = chatEntry
    ? entryDisplayName(chatEntry)
    : "未配置"

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

  useLayoutEffect(() => {
    if (messages.length === 0) return
    if (!stickToBottomRef.current) return
    scrollChatToBottom()
  }, [messages, scrollChatToBottom])

  const patchAssistantStream = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      updateMessage(id, patch)
    },
    [updateMessage]
  )

  const patchAssistant = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      updateMessage(id, patch)
    },
    [updateMessage]
  )

  const send = useCallback(async () => {
    const text = input.trim()
    const hasText = text.length > 0
    const hasFile = attachedFile !== null
    if ((!hasText && !hasFile) || isGenerating) return

    stickToBottomRef.current = true

    let sid = sessionIdRef.current
    let createdSession = false
    if (!sid) {
      const session = await ensurePiChatSessionForSend()
      sid = session.id
      createdSession = true
      sessionIdRef.current = sid
      setActiveSessionId(sid)
      await persistActiveSessionId(sid)
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    }

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

    addMessage({
      id: userId,
      role: "user",
      content: hasText ? userContent : `[文件] ${attachedFile?.name}`,
      thinking: "",
    })
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      thinking: "",
      isStreaming: true,
      toolCalls: [],
    })

    if (createdSession && sid) {
      await resetAgent([], sid)
    }

    const settingsForSend = await getRuntimeSettings()
    const entryForSend = resolveChatModelEntry(settingsForSend, userContent)
    const modelFile = entryForSend?.model ?? chatEntry?.model
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
          patchAssistantStream(assistantId, { thinking, content })
        },
        onWorkflow: (steps) => {
          patchAssistantStream(assistantId, { agentSteps: steps })
        },
        onToolStart: (item) => {
          const current = getMessage(assistantId)
          const list = current?.toolCalls ?? []
          const idx = list.findIndex((t) => t.toolCallId === item.toolCallId)
          const next =
            idx >= 0
              ? list.map((t, i) => (i === idx ? { ...t, ...item } : t))
              : [...list, item]
          patchAssistant(assistantId, { toolCalls: next })
        },
        onToolUpdate: (toolCallId, partialResult) => {
          const current = getMessage(assistantId)
          patchAssistant(assistantId, {
            toolCalls: (current?.toolCalls ?? []).map((t) =>
              t.toolCallId === toolCallId
                ? { ...t, partialResult, status: "running" as const }
                : t
            ),
          })
        },
        onToolEnd: (item) => {
          const current = getMessage(assistantId)
          const list = current?.toolCalls ?? []
          const idx = list.findIndex((t) => t.toolCallId === item.toolCallId)
          const next =
            idx >= 0
              ? list.map((t, i) => (i === idx ? { ...t, ...item } : t))
              : [...list, item]
          patchAssistant(assistantId, { toolCalls: next })
        },
        onUsage: (summary) => {
          patchAssistantStream(assistantId, { usageSummary: summary })
        },
      })

      const parsed = parseModelThinking(result.content)
      const finalThinking =
        getMessage(assistantId)?.thinking?.trim() ||
        result.thinking ||
        parsed.thinking
      const finalContent = parsed.visible || result.content

      if (!finalContent.trim()) {
        const emptyMsg = "模型未返回内容，请检查连接或 API 配置"
        patchAssistant(assistantId, {
          isStreaming: false,
          failed: true,
          content: emptyMsg,
        })
        toast.error(emptyMsg)
        return
      }

      const finalMsg = getMessage(assistantId)
      patchAssistant(assistantId, {
        content: finalContent,
        thinking: finalThinking,
        isStreaming: false,
        agentSteps: finalMsg?.agentSteps,
        toolCalls: finalMsg?.toolCalls,
        usageSummary: finalMsg?.usageSummary,
      })
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })

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
      patchAssistant(assistantId, {
        isStreaming: false,
        failed: true,
        content: message,
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
    addMessage,
    patchAssistant,
    patchAssistantStream,
    getMessage,
    queryClient,
    runPrompt,
    resetAgent,
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 sm:px-6">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/10 pb-3 pt-2">
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
                        {lastAssistant.toolCalls.map((tc) => (
                          <li
                            key={tc.toolCallId}
                            className="rounded-xl border border-border/60 bg-muted/30 p-2 font-mono"
                          >
                            <span className="font-sans font-medium text-foreground">
                              {tc.name}
                            </span>
                            {tc.result ? (
                              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
                                {tc.result.slice(0, 400)}
                              </pre>
                            ) : null}
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
                  void (async () => {
                    const sid = sessionIdRef.current
                    clearConversation()
                    if (sid) {
                      await removePiChatSession(sid)
                    }
                    const session = await startNewPiChatSession()
                    sessionIdRef.current = session.id
                    setActiveSessionId(session.id)
                    await resetAgent([])
                    void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
                  })()
                }}
                aria-label="清空对话"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={onMessagesScroll}
          className="min-h-0 flex-1 overflow-y-auto py-4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
              <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-primary/10 shadow-sm">
                <Sparkles className="size-9 text-primary" />
              </div>
              <p className="text-xl font-semibold tracking-tight">说说你想做什么</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl pb-8">
              {messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  modelName={chatModelName}
                  transport={chatEntry?.transport}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 shrink-0 rounded-2xl border border-border/40 bg-card shadow-sm">
          {attachedFile && (
            <div className="flex items-center gap-2 border-b border-border/20 px-4 py-2.5">
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
            className="min-h-[56px] resize-none rounded-none border-0 bg-transparent px-4 py-3.5 text-sm leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0"
            placeholder="输入消息…"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              if (e.ctrlKey || e.metaKey) return
              e.preventDefault()
              send()
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/20 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <ChatTierPicker disabled={isGenerating} />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full"
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
            </div>

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

