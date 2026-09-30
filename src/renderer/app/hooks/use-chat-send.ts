import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { usePiAgentChat } from "~/hooks/use-pi-agent-chat"
import { appendModelReplyHints, parseModelThinking } from "~/lib/agent-steps"
import {
  ensurePiChatSessionForSend,
  setActiveSessionId as persistActiveSessionId,
  pruneEmptyPiChatSessions,
} from "~/services/pi-chat-sessions"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"
import { useAppStore } from "~/stores/app-store"
import type { ImageContent } from "../../../shared/pi-sdk"

type PendingSend = {
  userId: string
  assistantId: string
  userContent: string
  contentJson?: unknown
  images?: ImageContent[]
  cancelled: boolean
}

export function useChatSend({
  agentSystemPrompt,
  activeSessionId,
  onSessionCreated,
  chatEntry,
  sessionIdRef,
  sessionsReady,
}: {
  agentSystemPrompt: string
  activeSessionId: string | null
  onSessionCreated?: (sid: string) => void
  chatEntry: ReturnType<typeof resolveChatModelEntry>
  sessionIdRef: React.MutableRefObject<string | null>
  sessionsReady: boolean
}) {
  const queryClient = useQueryClient()
  const addMessage = useAppStore((s) => s.addMessage)
  const insertMessageAfter = useAppStore((s) => s.insertMessageAfter)
  const updateMessage = useAppStore((s) => s.updateMessage)
  const removeMessage = useAppStore((s) => s.removeMessage)
  const getMessage = (id: string) =>
    useAppStore.getState().conversationHistory.find((m) => m.id === id)
  const [isGenerating, setIsGenerating] = useState(false)
  const pendingRef = useRef<PendingSend[]>([])
  const drainingRef = useRef(false)
  const activeAssistantId = useRef<string | null>(null)
  const abortRequestedRef = useRef(false)

  const {
    runPrompt,
    abort: abortPiAgent,
    resetAgent,
  } = usePiAgentChat({
    systemPrompt: agentSystemPrompt,
    diskSessionId: activeSessionId,
    enabled: sessionsReady && Boolean(activeSessionId),
  })

  const syncQueuedFlags = () => {
    const pending = pendingRef.current
    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i]
      if (item.cancelled) continue
      updateMessage(item.userId, { queued: i > 0 })
    }
  }

  const abort = () => {
    abortRequestedRef.current = true
    const id = activeAssistantId.current
    if (id) updateMessage(id, { isStreaming: false })
    abortPiAgent()
    activeAssistantId.current = null
  }

  const cancelQueued = (userId: string) => {
    const pending = pendingRef.current
    const idx = pending.findIndex((p) => p.userId === userId)
    if (idx < 0) return
    pending[idx].cancelled = true
    removeMessage(userId)
    pending.splice(idx, 1)
    syncQueuedFlags()
  }

  const editQueued = (
    userId: string,
    content: string,
    contentJson?: unknown
  ) => {
    const item = pendingRef.current.find((p) => p.userId === userId)
    if (!item || item.cancelled) return
    item.userContent = content
    item.contentJson = contentJson
    updateMessage(userId, {
      content,
      contentJson: contentJson as never,
    })
  }

  const drainQueue = async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    setIsGenerating(true)

    try {
      while (pendingRef.current.length > 0) {
        const item = pendingRef.current[0]
        if (item.cancelled) {
          pendingRef.current.shift()
          continue
        }

        syncQueuedFlags()
        updateMessage(item.userId, { queued: false })
        abortRequestedRef.current = false

        const { userId, assistantId, userContent, images } = item

        try {
          const settingsForSend = await getRuntimeSettings()
          const entryForSend = resolveChatModelEntry(settingsForSend)
          const modelFile = entryForSend?.model ?? chatEntry?.model
          const userForAgent = appendModelReplyHints(userContent, modelFile)

          const result = await runPrompt({
            userMessage: userForAgent,
            images,
            assistantId,
            onReady: () => {
              abortRequestedRef.current = false
              activeAssistantId.current = assistantId
              insertMessageAfter(userId, {
                id: assistantId,
                role: "assistant",
                content: "",
                thinking: "",
                isStreaming: true,
                toolCalls: [],
              })
            },
            onStream: ({ thinking, content, activity, toolCalls }) => {
              updateMessage(assistantId, {
                thinking,
                content,
                activity,
                toolCalls,
              })
            },
            onUsage: (summary) => {
              updateMessage(assistantId, { usageSummary: summary })
            },
          })

          if (abortRequestedRef.current) {
            updateMessage(assistantId, { isStreaming: false })
            pendingRef.current.shift()
            break
          }

          const parsed = parseModelThinking(result.content)
          const finalThinking =
            getMessage(assistantId)?.thinking?.trim() ||
            result.thinking ||
            parsed.thinking
          const finalContent = parsed.visible || result.content
          const hasTools = (getMessage(assistantId)?.toolCalls?.length ?? 0) > 0

          if (!finalContent.trim() && !finalThinking.trim() && !hasTools) {
            const emptyMsg = "模型未返回内容，请检查连接或 API 配置"
            updateMessage(assistantId, {
              isStreaming: false,
              failed: true,
              errorMessage: emptyMsg,
            })
            toast.error(emptyMsg)
          } else {
            const finalMsg = getMessage(assistantId)
            updateMessage(assistantId, {
              content: finalContent.trim()
                ? finalContent
                : (finalMsg?.content ?? ""),
              thinking: finalThinking,
              activity: finalMsg?.activity,
              isStreaming: false,
              toolCalls: finalMsg?.toolCalls,
              usageSummary: finalMsg?.usageSummary,
            })
            queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "生成失败"
          if (getMessage(assistantId)) {
            updateMessage(assistantId, {
              isStreaming: false,
              failed: true,
              errorMessage: message,
            })
          }
          toast.error(message)
        } finally {
          if (activeAssistantId.current === assistantId) {
            activeAssistantId.current = null
          }
        }

        pendingRef.current.shift()
        syncQueuedFlags()
      }
    } finally {
      drainingRef.current = false
      setIsGenerating(pendingRef.current.some((p) => !p.cancelled))
      if (pendingRef.current.some((p) => !p.cancelled)) {
        void drainQueue()
      }
    }
  }

  const send = async (
    userContent: string,
    options?: { contentJson?: unknown; images?: ImageContent[] }
  ) => {
    const images = options?.images?.length ? options.images : undefined
    if (!userContent && !images?.length) return

    let sid = sessionIdRef.current
    let createdSession = false
    if (!sid) {
      const session = await ensurePiChatSessionForSend()
      sid = session.id
      createdSession = true
      sessionIdRef.current = sid
      onSessionCreated?.(sid)
      await persistActiveSessionId(sid)
      await pruneEmptyPiChatSessions(sid)
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    }

    if (createdSession && sid) {
      await resetAgent([], sid)
    }

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const willQueue =
      drainingRef.current || pendingRef.current.some((p) => !p.cancelled)

    addMessage({
      id: userId,
      role: "user",
      content: userContent || (images?.length ? "[图片]" : ""),
      contentJson: options?.contentJson as never,
      thinking: "",
      queued: willQueue,
    })

    pendingRef.current.push({
      userId,
      assistantId,
      userContent,
      contentJson: options?.contentJson,
      images,
      cancelled: false,
    })

    syncQueuedFlags()
    void drainQueue()
  }

  return { send, abort, isGenerating, resetAgent, cancelQueued, editQueued }
}
