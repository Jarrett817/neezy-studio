import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  ArrowUp,
  FileText,
  FolderOpen,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Square,
  X,
} from "lucide-react"
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"
import { useLocation, useNavigate } from "react-router"
import { toast } from "sonner"
import { ShellHeaderActions } from "~/components/app-shell"
import {
  ChatEditor,
  type ChatEditorHandle,
} from "~/components/chat/chat-editor"
import { ChatSessionSidebar } from "~/components/chat/chat-session-sidebar"
import { ContextUsageRing } from "~/components/chat/context-usage-ring"
import { QueuedUserMessage } from "~/components/chat/queued-user-message"
import { NomiFace } from "~/components/nomi-face"
import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { entryDisplayName } from "~/config/chat-models"
import { useChatSend } from "~/hooks/use-chat-send"
import { useChatSession } from "~/hooks/use-chat-session"
import { partitionChatMessages } from "~/lib/chat-message-order"
import { cn } from "~/lib/utils"
import {
  extractImageContentsFromTiptap,
  tiptapToPlainText,
} from "~/services/chat-content"
import {
  getAgentContextUsage,
  listAgentSkillCommands,
} from "~/services/pi-agent-client"
import { getElectronApi } from "~/services/electron-client"
import {
  loadPiChatMessages,
  startNewPiChatSession,
} from "~/services/pi-chat-sessions"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"
import {
  getStoragePaths,
  pickDirectory,
  saveWorkspaceDir,
} from "~/services/electron-client"
import { useAppStore } from "~/stores/app-store"
import type { ContextUsageWire } from "../../../shared/chat-wire"

const ChatOptionsSheet = lazy(
  () => import("~/components/chat/chat-options-sheet")
)

const ChatMessageBubble = lazy(() =>
  import("~/components/chat/chat-message").then((m) => ({
    default: m.ChatMessageBubble,
  }))
)

const SCROLL_NEAR_BOTTOM_PX = 80

function workspaceLabel(dir: string | undefined): string {
  if (!dir?.trim()) return "未设置"
  const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean)
  return parts.at(-1) || dir
}

function WorkspacePicker({ onChanged }: { onChanged: () => void }) {
  const queryClient = useQueryClient()
  const { data: paths } = useQuery({
    queryKey: ["storage-paths"],
    queryFn: getStoragePaths,
  })
  const mutation = useMutation({
    mutationFn: saveWorkspaceDir,
    onSuccess: (next) => {
      queryClient.setQueryData(["storage-paths"], next)
      onChanged()
      toast.success(
        next.workspaceCustomized
          ? `工作目录：${workspaceLabel(next.workspaceDir)}`
          : "已清除工作目录"
      )
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "设置工作目录失败")
    },
  })

  if (!paths) return null

  const customized = Boolean(paths.workspaceCustomized && paths.workspaceDir)
  const workspaceDir = customized ? paths.workspaceDir : ""
  const label = customized ? workspaceLabel(workspaceDir) : "选择工作目录"
  const title = customized
    ? `工作目录（Agent 读写文件的 cwd）\n${workspaceDir}`
    : "选择项目文件夹，例如 D:\\projects\\my-app；与设置里的数据目录无关"

  return (
    <div className="flex min-w-0 max-w-[14rem] items-center gap-0.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 min-w-0 max-w-full gap-1.5 rounded-lg px-2 hover:bg-accent/30 hover:text-foreground",
                customized ? "text-foreground/80" : "text-muted-foreground/70"
              )}
              disabled={mutation.isPending}
              onClick={async () => {
                const selected = await pickDirectory({
                  title: "选择工作目录（代码项目文件夹）",
                  defaultPath: customized ? workspaceDir : undefined,
                })
                if (selected) mutation.mutate(selected)
              }}
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <FolderOpen className="size-3.5 shrink-0" />
              )}
              <span className="truncate text-xs">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-sm whitespace-pre-wrap break-all"
          >
            {title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {customized ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-lg text-muted-foreground/50 hover:bg-accent/30 hover:text-foreground"
          title="清除工作目录"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(null)}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function isNearBottom(el: HTMLElement) {
  return (
    el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_NEAR_BOTTOM_PX
  )
}

export default function ChatRoute() {
  const { pathname, state: locationState } = useLocation()
  const navigate = useNavigate()
  const isChatRoute = pathname === "/chat" || pathname === "/"

  const {
    activeSessionId,
    setActiveSessionId,
    sessionsReady,
    sessionIdRef,
    handleSelectSession,
    handleNewSession,
  } = useChatSession()

  const queryClient = useQueryClient()
  const setConversationHistory = useAppStore((s) => s.setConversationHistory)
  const messages = useAppStore((s) => s.conversationHistory)
  const { main: mainMessages, queued: queuedMessages } =
    partitionChatMessages(messages)
  const lastMain = mainMessages.at(-1)
  const scrollTailKey = lastMain
    ? `${lastMain.id}:${lastMain.content.length}:${lastMain.thinking?.length ?? 0}:${lastMain.activity?.length ?? 0}:${lastMain.isStreaming ? 1 : 0}`
    : ""
  const editorRef = useRef<ChatEditorHandle>(null)
  const [hasText, setHasText] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{
    name: string
    content: string
  } | null>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickToBottomRef.current = isNearBottom(el)
  }

  const scrollToBottom = (force = false) => {
    if (!force && !stickToBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
  }

  useLayoutEffect(() => {
    if (!isChatRoute || !sessionsReady || messages.length === 0) return
    stickToBottomRef.current = true
    scrollToBottom(true)
  }, [isChatRoute, activeSessionId, sessionsReady])

  useLayoutEffect(() => {
    if (messages.length === 0) return
    scrollToBottom(false)
  }, [scrollTailKey])

  useEffect(() => {
    if (!isChatRoute || !sessionsReady || messages.length === 0) return
    const content = scrollRef.current?.querySelector(
      "[data-chat-scroll-content]"
    )
    if (!(content instanceof HTMLElement)) return
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollToBottom(false)
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [isChatRoute, activeSessionId, sessionsReady])

  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const chatEntry = runtimeSettings
    ? resolveChatModelEntry(runtimeSettings)
    : null

  const {
    send,
    abort: abortSend,
    isGenerating,
    resetAgent,
    cancelQueued,
    editQueued,
  } = useChatSend({
    activeSessionId,
    onSessionCreated: (sid) => flushSync(() => setActiveSessionId(sid)),
    chatEntry,
    sessionIdRef,
    sessionsReady,
  })

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) return
    void resetAgent([], activeSessionId)
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: ["agent-context-usage", activeSessionId],
        })
        void queryClient.invalidateQueries({
          queryKey: ["agent-skill-commands", activeSessionId],
        })
      })
      .catch(() => {})
  }, [activeSessionId, sessionsReady, queryClient, resetAgent])

  useEffect(() => {
    const selectSessionId = (
      locationState as { selectSessionId?: string } | null
    )?.selectSessionId
    if (!selectSessionId || !sessionsReady) return
    void handleSelectSession(selectSessionId).finally(() => {
      navigate(pathname, { replace: true, state: null })
    })
  }, [locationState, sessionsReady, handleSelectSession, navigate, pathname])

  useEffect(() => {
    return getElectronApi().onTasksSessionComplete(({ sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      if (sessionId !== activeSessionId) return
      void loadPiChatMessages(sessionId)
        .then(setConversationHistory)
        .catch(() => {})
    })
  }, [activeSessionId, queryClient, setConversationHistory])

  const { data: contextUsage } = useQuery({
    queryKey: ["agent-context-usage", activeSessionId],
    queryFn: () => {
      if (!activeSessionId) throw new Error("no session")
      return getAgentContextUsage(activeSessionId)
    },
    enabled: Boolean(activeSessionId && sessionsReady),
    refetchInterval: isGenerating ? 2000 : false,
  })

  const contextUsageForRing: ContextUsageWire = contextUsage ?? {
    tokens: null,
    contextWindow: chatEntry?.contextWindow ?? 128_000,
    percent: null,
  }

  const { data: skillCommands = [] } = useQuery({
    queryKey: ["agent-skill-commands", activeSessionId],
    queryFn: () => {
      if (!activeSessionId) throw new Error("no session")
      return listAgentSkillCommands(activeSessionId)
    },
    enabled: Boolean(activeSessionId && sessionsReady),
  })

  const doSend = () => {
    const contentJson = editorRef.current?.getJSON() ?? null
    const text = tiptapToPlainText(contentJson)
    const images = extractImageContentsFromTiptap(contentJson)
    const hasFile = attachedFile !== null
    if (!text && !hasFile && images.length === 0) return

    stickToBottomRef.current = true
    const fileSnapshot = attachedFile
    editorRef.current?.clear()
    setHasText(false)
    setAttachedFile(null)

    const agentContent = fileSnapshot
      ? text
        ? `${text}\n\n[附件: ${fileSnapshot.name}]\n---\n${fileSnapshot.content}\n---`
        : `[附件: ${fileSnapshot.name}]\n---\n${fileSnapshot.content}\n---`
      : text
    send(agentContent, {
      contentJson: contentJson ?? undefined,
      images: images.length > 0 ? images : undefined,
    })
  }

  const doNewSession = async () => {
    const session = await startNewPiChatSession()
    await handleNewSession(session.id)
    resetAgent([], session.id).catch(() => {})
    queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
    editorRef.current?.focus()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsReadingFile(true)
    try {
      const text = await file.text()
      const content =
        text.length <= 32000
          ? text
          : `${text.slice(0, 16000)}\n...\n(内容过长，已截断中间部分)\n...\n${text.slice(text.length - 16000)}`
      setAttachedFile({ name: file.name, content })
    } catch {
      /* ignore */
    } finally {
      setIsReadingFile(false)
    }
    e.target.value = ""
  }

  const chatModelName = chatEntry ? entryDisplayName(chatEntry) : "未配置"
  const lastAssistant = mainMessages.findLast((m) => m.role === "assistant")

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
      {isChatRoute ? (
        <ShellHeaderActions>
          <ChatSessionSidebar
            activeSessionId={activeSessionId}
            onSelectSession={async (id) => {
              await handleSelectSession(id)
              resetAgent([], id).catch(() => {})
            }}
            onSessionCreated={async (id) => {
              await handleNewSession(id)
              resetAgent([], id).catch(() => {})
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground/60 hover:bg-accent/30 hover:text-foreground"
            aria-label="新对话"
            title="新对话"
            onClick={() => void doNewSession()}
          >
            <MessageSquarePlus className="size-4" />
          </Button>
          <WorkspacePicker
            onChanged={() => {
              if (!activeSessionId) return
              resetAgent([], activeSessionId).catch(() => {})
            }}
          />
          <div className="min-w-0 flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground/60 hover:bg-accent/30 hover:text-foreground"
            aria-label="对话选项"
            onClick={() => setOptionsOpen(true)}
          >
            <MoreHorizontal className="size-4" />
          </Button>
          {optionsOpen ? (
            <Suspense fallback={null}>
              <ChatOptionsSheet
                open
                toolCalls={lastAssistant?.toolCalls}
                onOpenChange={setOptionsOpen}
              />
            </Suspense>
          ) : null}
        </ShellHeaderActions>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto px-0 py-0"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
              <NomiFace className="size-20" />
              <p className="font-heading text-xl font-semibold tracking-tight text-foreground/80">
                说说你想做什么
              </p>
            </div>
          ) : (
            <div
              data-chat-scroll-content
              className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end px-4 pb-8"
            >
              <Suspense fallback={null}>
                {mainMessages.map((m, i) => (
                  <ChatMessageBubble
                    key={m.id}
                    message={m}
                    modelName={chatModelName}
                    index={i}
                  />
                ))}
              </Suspense>
              {queuedMessages.length > 0 ? (
                <div className="mt-4 space-y-1 border-t border-border/50 pt-4">
                  {queuedMessages.map((m) => (
                    <QueuedUserMessage
                      key={m.id}
                      message={m}
                      onCancel={cancelQueued}
                      onSaveEdit={editQueued}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0 pb-0 pt-2">
          <div className="mx-auto w-full max-w-5xl px-4">
            <div className="overflow-visible rounded-[24px] border border-border/70 bg-background/70 shadow-sm backdrop-blur-sm transition-shadow focus-within:shadow-lg focus-within:ring-1 focus-within:ring-primary/25 dark:border-border/50 dark:bg-card/60">
              {attachedFile && (
                <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-xs text-muted-foreground/80">
                    {attachedFile.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 rounded-lg text-muted-foreground/50 hover:text-foreground"
                    onClick={() => setAttachedFile(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
              <ChatEditor
                ref={editorRef}
                onEmptyChange={(empty) => setHasText(!empty)}
                placeholder="输入消息，/ 调用技能"
                skills={skillCommands}
                onSubmit={() => doSend()}
              />
              <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.md,.txt,.csv,.json"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-muted-foreground/50 hover:bg-accent/40 hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReadingFile}
                    title="附加文件"
                  >
                    {isReadingFile ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Paperclip className="size-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {activeSessionId ? (
                    <ContextUsageRing usage={contextUsageForRing} />
                  ) : null}
                  {isGenerating ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 rounded-full border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      onClick={abortSend}
                    >
                      <Square className="size-3 fill-current" />
                      停止
                    </Button>
                  ) : null}
                  <motion.div whileTap={{ scale: 0.94 }}>
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-full px-5 shadow-sm"
                      disabled={!hasText && !attachedFile}
                      onClick={doSend}
                    >
                      <ArrowUp className="size-4" />
                      发送
                    </Button>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
