import { useState, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { ImageContent } from "../../../shared/pi-sdk"
import { useAppStore } from "~/stores/app-store"
import { usePiAgentChat } from "~/hooks/use-pi-agent-chat"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"
import {
  ensurePiChatSessionForSend,
  pruneEmptyPiChatSessions,
  setActiveSessionId as persistActiveSessionId,
} from "~/services/pi-chat-sessions"
import { appendModelReplyHints, parseModelThinking } from "~/lib/agent-steps"

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
  const updateMessage = useAppStore((s) => s.updateMessage)
  const getMessage = useCallback(
    (id: string) => useAppStore.getState().conversationHistory.find((m) => m.id === id),
    []
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const inflightRef = useRef(0)
  const activeAssistantId = useRef<string | null>(null)
  const abortRequestedRef = useRef(false)

  const { runPrompt, abort: abortPiAgent, resetAgent } = usePiAgentChat({
    systemPrompt: agentSystemPrompt,
    diskSessionId: activeSessionId,
    enabled: sessionsReady && Boolean(activeSessionId),
  })

  const beginInflight = () => {
    inflightRef.current += 1
    setIsGenerating(true)
  }

  const endInflight = () => {
    inflightRef.current = Math.max(0, inflightRef.current - 1)
    setIsGenerating(inflightRef.current > 0)
  }

  const abort = useCallback(() => {
    abortRequestedRef.current = true
    const id = activeAssistantId.current
    if (id) updateMessage(id, { isStreaming: false })
    abortPiAgent()
    setIsGenerating(inflightRef.current > 1)
    activeAssistantId.current = null
  }, [updateMessage, abortPiAgent])

  const send = useCallback(
    async (
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

      const userId = crypto.randomUUID()
      const assistantId = crypto.randomUUID()

      addMessage({
        id: userId,
        role: "user",
        content: userContent || (images?.length ? "[图片]" : ""),
        contentJson: options?.contentJson as never,
        thinking: "",
      })

      beginInflight()
      abortRequestedRef.current = false

      try {
        if (createdSession && sid) {
          await resetAgent([], sid)
        }

        const settingsForSend = await getRuntimeSettings()
        const entryForSend = resolveChatModelEntry(settingsForSend)
        const modelFile = entryForSend?.model ?? chatEntry?.model
        const userForAgent = appendModelReplyHints(userContent, modelFile)

        // runPrompt 经 sessionLock 串行：生成中再发会排队，轮到时再挂 assistant 气泡
        const result = await runPrompt({
          userMessage: userForAgent,
          images,
          assistantId,
          onReady: () => {
            abortRequestedRef.current = false
            activeAssistantId.current = assistantId
            addMessage({
              id: assistantId,
              role: "assistant",
              content: "",
              thinking: "",
              isStreaming: true,
              toolCalls: [],
            })
          },
          onStream: ({ thinking, content, activity }) => {
            updateMessage(assistantId, { thinking, content, activity })
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

        if (abortRequestedRef.current) {
          updateMessage(assistantId, { isStreaming: false })
          return
        }

        const parsed = parseModelThinking(result.content)
        const finalThinking = getMessage(assistantId)?.thinking?.trim() || result.thinking || parsed.thinking
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
          return
        }

        const finalMsg = getMessage(assistantId)
        updateMessage(assistantId, {
          content: finalContent.trim() ? finalContent : finalMsg?.content ?? "",
          thinking: finalThinking,
          isStreaming: false,
          agentSteps: finalMsg?.agentSteps,
          toolCalls: finalMsg?.toolCalls,
          usageSummary: finalMsg?.usageSummary,
        })
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
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
        endInflight()
      }
    },
    [
      addMessage,
      updateMessage,
      getMessage,
      queryClient,
      runPrompt,
      resetAgent,
      chatEntry,
      onSessionCreated,
      sessionIdRef,
    ]
  )

  return { send, abort, isGenerating, resetAgent }
}
