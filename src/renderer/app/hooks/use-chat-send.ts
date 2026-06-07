import { useState, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useAppStore } from "~/stores/app-store"
import { usePiAgentChat } from "~/hooks/use-pi-agent-chat"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"
import {
  bindChatSessionPlaybook,
  ensurePiChatSessionForSend,
  pruneEmptyPiChatSessions,
} from "~/services/pi-chat-sessions"
import { setActiveSessionId as persistActiveSessionId } from "~/services/pi-chat-sessions"
import { addConversationSlice } from "~/services/storage/memory-vectors"
import { rememberConversationTurn } from "~/services/memory-profile"
import {
  getPortraitContextForPrompt,
  updatePortraitFromConversation,
} from "~/services/user-portrait"
import {
  compilePrompt,
  buildSceneAgentSystemPrompt,
  type InputProfile,
  type PlaybookSlots,
} from "~/services/playbook"
import { appendModelReplyHints, parseModelThinking } from "~/lib/agent-steps"

export function useChatSend({
  agentSystemPrompt,
  activeSessionId,
  onSessionCreated,
  activePlaybookId,
  sceneProfile,
  sceneSlotValues,
  chatEntry,
  syncPlaybookInUrl,
  sessionIdRef,
  sessionsReady,
}: {
  agentSystemPrompt: string
  activeSessionId: string | null
  onSessionCreated?: (sid: string) => void
  activePlaybookId: string | null
  sceneProfile: InputProfile | null
  sceneSlotValues: Record<string, unknown>
  chatEntry: ReturnType<typeof resolveChatModelEntry>
  syncPlaybookInUrl: (playbookId: string | null, sessionId?: string | null) => void
  sessionIdRef: React.MutableRefObject<string | null>
  sessionsReady: boolean
}) {
  const queryClient = useQueryClient()
  const addMessage = useAppStore((s) => s.addMessage)
  const updateMessage = useAppStore((s) => s.updateMessage)
  const getMessage = useCallback(
    (id: string) => useAppStore.getState().conversationHistory.find((m) => m.id === id),
    []
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const activeAssistantId = useRef<string | null>(null)

  const { runPrompt, abort: abortPiAgent, resetAgent } = usePiAgentChat({
    systemPrompt: agentSystemPrompt,
    diskSessionId: activeSessionId,
    enabled: sessionsReady && Boolean(activeSessionId),
  })

  const abort = useCallback(() => {
    const id = activeAssistantId.current
    if (id) updateMessage(id, { isStreaming: false })
    abortPiAgent()
    setIsGenerating(false)
    activeAssistantId.current = null
  }, [updateMessage, abortPiAgent])

  const send = useCallback(
    async (userContent: string) => {
      if (isGenerating || !userContent) return

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
        if (activePlaybookId) {
          await bindChatSessionPlaybook(sid, activePlaybookId)
          syncPlaybookInUrl(activePlaybookId, sid)
        }
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      } else if (activePlaybookId) {
        await bindChatSessionPlaybook(sid, activePlaybookId)
      }

      const userId = crypto.randomUUID()
      const assistantId = crypto.randomUUID()
      activeAssistantId.current = assistantId

      setIsGenerating(true)

      addMessage({ id: userId, role: "user", content: userContent, thinking: "" })
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
        await getPortraitContextForPrompt().then((ctx) => { portraitContext = ctx })

        const userForAgent = appendModelReplyHints(
          portraitContext ? `${userContent}\n${portraitContext}` : userContent,
          modelFile
        )

        const result = await runPrompt({
          userMessage: userForAgent,
          assistantId,
          onStream: ({ thinking, content }) => {
            updateMessage(assistantId, { thinking, content })
          },
          onWorkflow: (steps) => {
            updateMessage(assistantId, { agentSteps: steps })
          },
          onToolStart: (item) => {
            const current = getMessage(assistantId)
            const list = current?.toolCalls ?? []
            const idx = list.findIndex((t) => t.toolCallId === item.toolCallId)
            updateMessage(assistantId, {
              toolCalls: idx >= 0
                ? list.map((t, i) => (i === idx ? { ...t, ...item } : t))
                : [...list, item],
            })
          },
          onToolUpdate: (toolCallId, partialResult) => {
            const current = getMessage(assistantId)
            updateMessage(assistantId, {
              toolCalls: (current?.toolCalls ?? []).map((t) =>
                t.toolCallId === toolCallId ? { ...t, partialResult, status: "running" as const } : t
              ),
            })
          },
          onToolEnd: (item) => {
            const current = getMessage(assistantId)
            const list = current?.toolCalls ?? []
            const idx = list.findIndex((t) => t.toolCallId === item.toolCallId)
            updateMessage(assistantId, {
              toolCalls: idx >= 0
                ? list.map((t, i) => (i === idx ? { ...t, ...item } : t))
                : [...list, item],
            })
          },
          onUsage: (summary) => {
            updateMessage(assistantId, { usageSummary: summary })
          },
        })

        const parsed = parseModelThinking(result.content)
        const finalThinking = getMessage(assistantId)?.thinking?.trim() || result.thinking || parsed.thinking
        const finalContent = parsed.visible || result.content

        if (!finalContent.trim()) {
          const emptyMsg = "模型未返回内容，请检查连接或 API 配置"
          updateMessage(assistantId, { isStreaming: false, failed: true, content: emptyMsg })
          toast.error(emptyMsg)
          return
        }

        const finalMsg = getMessage(assistantId)
        updateMessage(assistantId, {
          content: finalContent,
          thinking: finalThinking,
          isStreaming: false,
          agentSteps: finalMsg?.agentSteps,
          toolCalls: finalMsg?.toolCalls,
          usageSummary: finalMsg?.usageSummary,
        })
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })

        updatePortraitFromConversation({ userContent, assistantContent: finalContent })
          .then(() => queryClient.invalidateQueries({ queryKey: ["user-portrait"] }))
          .catch((err) => console.warn("[portrait] update failed:", err))
        rememberConversationTurn({ userContent, assistantContent: finalContent })
          .catch((err) => console.warn("[memory] remember failed:", err))
        addConversationSlice(assistantId, userContent).catch((err) => {
          console.warn("Failed to save conversation slice:", err)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成失败"
        updateMessage(assistantId, { isStreaming: false, failed: true, content: message })
        toast.error(message)
      } finally {
        setIsGenerating(false)
        activeAssistantId.current = null
      }
    },
    [
      isGenerating,
      addMessage,
      updateMessage,
      getMessage,
      queryClient,
      runPrompt,
      resetAgent,
      abortPiAgent,
      activePlaybookId,
      sceneProfile,
      sceneSlotValues,
      chatEntry,
      syncPlaybookInUrl,
    ]
  )

  return { send, abort, isGenerating, resetAgent }
}