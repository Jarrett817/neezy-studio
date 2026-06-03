import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import { flushSync } from "react-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { PlaybookInputForm } from "~/components/playbook/playbook-input-form"
import {
  compilePrompt,
  buildSceneAgentSystemPrompt,
  ensurePlaybookDirs,
  getInputProfile,
  getPlaybook,
  type InputProfile,
  type PlaybookSlots,
} from "~/services/playbook"
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
import { ChatSessionSidebar } from "~/components/chat/chat-session-sidebar"
import { useAgentPermissionDialog } from "~/components/chat/agent-permission-dialog"
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
  bindChatSessionPlaybook,
  ensurePiChatSessionForSend,
  getActiveSessionId,
  getChatSessionPlaybook,
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
import { agentStepsFromToolCalls } from "~/lib/assistant-timeline"
import { appendModelReplyHints, parseModelThinking } from "~/lib/agent-steps"
import { cn } from "~/lib/utils"

const SYSTEM_PROMPT =
  `你是 Neezy Studio 中的对话助手。回答用中文，语气清晰自然。可用工具包括：memory_search、memory_add、memory_event；无头网页自动化 browser_*（pi-textbrowser，Chromium 由应用自动安装）；操作用户已打开的 Chrome 用 chrome_*（pi-chrome：须先在 Chrome 加载 companion 扩展，且用户须在弹窗中确认「授权 Chrome 控制」）；Pi 内置 read/bash/edit/write/grep/find/ls；联网 web_search、fetch_content、code_search（pi-web-access）。需要时请直接调用，勿声称工具不存在；browser_* 失败时不要让用户手动安装 Chromium。`.trim()

const CHAT_SCROLL_NEAR_BOTTOM_PX = 80

function isChatNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= CHAT_SCROLL_NEAR_BOTTOM_PX
}

function validateSceneSlots(
  profile: InputProfile,
  slots: Record<string, unknown>
): string | null {
  for (const field of profile.fields) {
    if (!field.required) continue
    const v = slots[field.key]
    if (v === undefined || v === null || String(v).trim() === "") {
      return `请填写${field.label}`
    }
  }
  return null
}

function buildSceneUserContent(
  profile: InputProfile,
  slots: Record<string, unknown>,
  chatText: string,
  attachedFile: { name: string; content: string } | null
): string {
  const compiled = compilePrompt(profile, { slots: slots as PlaybookSlots })
  const parts = [compiled]
  const extra = chatText.trim()
  if (extra) parts.push(`【补充说明】\n${extra}`)
  if (attachedFile) {
    parts.push(`[附件: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`)
  }
  return parts.join("\n\n")
}

export default function ChatRoute() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionFromUrl = searchParams.get("session")?.trim() || null
  const playbookIdFromUrl = searchParams.get("playbook")?.trim() || null
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(
    playbookIdFromUrl
  )
  const [sceneSlotValues, setSceneSlotValues] = useState<Record<string, unknown>>(
    {}
  )
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
        const toolCalls = keep.toolCalls?.length ? keep.toolCalls : dm.toolCalls
        const agentSteps = keep.agentSteps?.length
          ? keep.agentSteps
          : toolCalls?.length
            ? agentStepsFromToolCalls(toolCalls)
            : dm.agentSteps
        return {
          ...dm,
          agentSteps,
          toolCalls,
          usageSummary: keep.usageSummary ?? dm.usageSummary,
          thinking: keep.thinking?.trim() ? keep.thinking : dm.thinking,
          content: keep.content?.trim() ? keep.content : dm.content,
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

  const { data: scenePlaybook } = useQuery({
    queryKey: ["playbook", activePlaybookId],
    queryFn: async () => {
      await ensurePlaybookDirs()
      return getPlaybook(activePlaybookId!)
    },
    enabled: Boolean(activePlaybookId),
  })

  const { data: sceneProfile } = useQuery({
    queryKey: ["input-profile", scenePlaybook?.inputProfileId],
    queryFn: () => getInputProfile(scenePlaybook!.inputProfileId),
    enabled: Boolean(scenePlaybook?.inputProfileId),
  })

  const syncPlaybookInUrl = useCallback(
    (playbookId: string | null, sessionId?: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sessionId) next.set("session", sessionId)
          else next.delete("session")
          if (playbookId) next.set("playbook", playbookId)
          else next.delete("playbook")
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    if (playbookIdFromUrl) setActivePlaybookId(playbookIdFromUrl)
  }, [playbookIdFromUrl])

  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const agentSystemPrompt =
    scenePlaybook != null
      ? buildSceneAgentSystemPrompt(SYSTEM_PROMPT, scenePlaybook)
      : activeSkill != null
        ? `${SYSTEM_PROMPT}\n\n当前技能: ${activeSkill}`
        : SYSTEM_PROMPT

  const { runPrompt, abort: abortPiAgent, resetAgent } = usePiAgentChat({
    systemPrompt: agentSystemPrompt,
    diskSessionId: activeSessionId,
    sceneSkillIds: scenePlaybook?.skillIds,
    enabled: sessionsReady && Boolean(activeSessionId),
    onDiskMessagesReload: syncFromDisk,
    onDiskSessionIdRebound: (id) => {
      if (sessionIdRef.current === id) return
      sessionIdRef.current = id
      flushSync(() => setActiveSessionId(id))
      void persistActiveSessionId(id)
    },
  })

  const permissionDialog = useAgentPermissionDialog(activeSessionId)

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
          const boundPlaybook = await getChatSessionPlaybook(loaded.session.id)
          const sceneId = playbookIdFromUrl ?? boundPlaybook
          if (sceneId) {
            setActivePlaybookId(sceneId)
            if (!playbookIdFromUrl) syncPlaybookInUrl(sceneId, loaded.session.id)
          }
          armStickToBottom()
          setConversationHistory(loaded.messages)
        } else if (playbookIdFromUrl) {
          sessionIdRef.current = null
          setActiveSessionId(null)
          setActivePlaybookId(playbookIdFromUrl)
          clearConversation()
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
  }, [
    setConversationHistory,
    clearConversation,
    sessionFromUrl,
    playbookIdFromUrl,
    queryClient,
    armStickToBottom,
    syncPlaybookInUrl,
  ])

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current) return
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      await persistActiveSessionId(sessionId)
      const loaded = await loadPiChatMessages(sessionId)
      const boundPlaybook = await getChatSessionPlaybook(sessionId)
      if (boundPlaybook) {
        setActivePlaybookId(boundPlaybook)
        syncPlaybookInUrl(boundPlaybook, sessionId)
      } else {
        setActivePlaybookId(null)
        syncPlaybookInUrl(null, sessionId)
      }
      setSceneSlotValues({})
      await resetAgent([], sessionId).catch((err) =>
        console.warn("[chat] reset agent failed:", err)
      )
      armStickToBottom()
      setConversationHistory(loaded)
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
    [
      setConversationHistory,
      queryClient,
      resetAgent,
      armStickToBottom,
      syncPlaybookInUrl,
    ]
  )

  const handleNewSession = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId
      flushSync(() => setActiveSessionId(sessionId))
      await persistActiveSessionId(sessionId)
      await pruneEmptyPiChatSessions(sessionId)
      clearConversation()
      setActivePlaybookId(null)
      setSceneSlotValues({})
      syncPlaybookInUrl(null, sessionId)
      await resetAgent([], sessionId).catch((err) =>
        console.warn("[chat] reset agent failed:", err)
      )
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
    [clearConversation, queryClient, resetAgent, syncPlaybookInUrl]
  )

  const chatEntry = runtimeSettings
    ? resolveChatModelEntry(runtimeSettings)
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
    const inScene = Boolean(activePlaybookId && sceneProfile)

    if (inScene && sceneProfile) {
      const slotErr = validateSceneSlots(sceneProfile, sceneSlotValues)
      if (slotErr) {
        toast.error(slotErr)
        return
      }
      const hasSlotInput = sceneProfile.fields.some((field) => {
        const v = sceneSlotValues[field.key]
        return v !== undefined && v !== null && String(v).trim() !== ""
      })
      if (!hasSlotInput && !hasText && !hasFile) {
        toast.error("请填写场景参数或输入补充说明")
        return
      }
    } else if (!hasText && !hasFile) {
      return
    }

    if (isGenerating) return

    stickToBottomRef.current = true

    let sid = sessionIdRef.current
    let createdSession = false
    if (!sid) {
      const session = await ensurePiChatSessionForSend()
      sid = session.id
      createdSession = true
      sessionIdRef.current = sid
      flushSync(() => setActiveSessionId(sid))
      await persistActiveSessionId(sid)
      await pruneEmptyPiChatSessions(sid)
      if (activePlaybookId) {
        await bindChatSessionPlaybook(sid, activePlaybookId)
        syncPlaybookInUrl(activePlaybookId, sid)
      }
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    } else if (activePlaybookId) {
      await bindChatSessionPlaybook(sid, activePlaybookId)
    }

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    activeAssistantId.current = assistantId

    let userContent = text
    if (inScene && sceneProfile) {
      userContent = buildSceneUserContent(
        sceneProfile,
        sceneSlotValues,
        text,
        attachedFile
      )
    } else if (attachedFile) {
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
      content:
        inScene || hasText
          ? userContent
          : `[文件] ${attachedFile?.name}`,
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
    const entryForSend = resolveChatModelEntry(settingsForSend)
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
    activePlaybookId,
    sceneProfile,
    sceneSlotValues,
    syncPlaybookInUrl,
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

  const showScenePanel = Boolean(activePlaybookId && scenePlaybook && sceneProfile)

  return (
    <div className="flex h-full min-h-0">
      <ChatSessionSidebar
        activeSessionId={activeSessionId}
        onSelectSession={(id) => void handleSelectSession(id)}
        onSessionCreated={(id) => void handleNewSession(id)}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
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
              <p className="text-xl font-semibold tracking-tight">
                {showScenePanel ? scenePlaybook?.name : "说说你想做什么"}
              </p>
              {showScenePanel && scenePlaybook?.description ? (
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {scenePlaybook.description}
                </p>
              ) : null}
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
            placeholder={
              showScenePanel ? "补充说明（可选）…" : "输入消息…"
            }
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
      {showScenePanel ? (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-card lg:flex">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold">{scenePlaybook?.name}</p>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {scenePlaybook?.description}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <PlaybookInputForm
              playbookId={activePlaybookId!}
              profile={sceneProfile!}
              formId="chat-scene-form"
              hideSubmitButton
              disabled={isGenerating}
              onValuesChange={setSceneSlotValues}
              onSubmit={() => void send()}
            />
          </div>
        </aside>
      ) : null}
      </div>
      {permissionDialog}
    </div>
  )
}

