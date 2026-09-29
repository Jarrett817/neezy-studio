import { useCallback, useEffect, useRef } from "react"

import type { AssistantMessage, ImageContent } from "../../../shared/pi-sdk"
import { formatWireUsage } from "../../../shared/chat-wire"
import {
  completeToolStep,
  createInitialAgentSteps,
  formatToolArgsSummary,
  formatToolPartialPreview,
  formatToolResultPreview,
  markAllDone,
  mergeStreamThinking,
  setCompactionStep,
  setRetryStep,
  setTurnPlanning,
  setTurnResponding,
  setTurnThinking,
  startToolStep,
  updateToolStep,
  type AgentStep,
  type AssistantActivityItem,
  type ChatToolCall,
} from "~/lib/agent-steps"
import { reduceAgentEvent, textFromAssistantMessage } from "~/lib/pi-agent-events"
import { useAppStore } from "~/stores/app-store"
import {
  abortAgentSession,
  configureAgentSession,
  createAgentSession,
  destroyAgentSession,
  promptAgent,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import { loadPiChatMessages } from "~/services/pi-chat-sessions"
import { pushRuntimeSettingsToMain } from "~/services/settings"
import { extractAgentFailure } from "~/services/agent-failure"

type UsePiAgentChatOptions = {
  systemPrompt: string
  diskSessionId: string | null
  enabled: boolean
  onDiskMessagesReload?: (messages: ReturnType<typeof useAppStore.getState>["conversationHistory"]) => void
  /** 磁盘会话 id 失效后主进程新建会话时回写 UI */
  onDiskSessionIdRebound?: (newId: string) => void
}

export function usePiAgentChat({
  systemPrompt,
  diskSessionId,
  enabled,
  onDiskMessagesReload,
  onDiskSessionIdRebound,
}: UsePiAgentChatOptions) {
  const agentSessionId = useRef<string | null>(null)
  const sessionOp = useRef<Promise<void>>(Promise.resolve())
  const activeAssistantId = useRef<string | null>(null)
  const streamState = useRef({ content: "", thinking: "" })
  const activityRef = useRef<AssistantActivityItem[]>([])
  const openThinkingIdRef = useRef<string | null>(null)
  const openTextIdRef = useRef<string | null>(null)
  const onStreamRef = useRef<
    ((patch: {
      thinking: string
      content: string
      activity: AssistantActivityItem[]
    }) => void) | null
  >(null)
  const onToolStartRef = useRef<((item: ChatToolCall) => void) | null>(null)
  const onToolUpdateRef = useRef<
    ((toolCallId: string, partialResult: string) => void) | null
  >(null)
  const onToolEndRef = useRef<
    | ((
        item: ChatToolCall
      ) => void)
    | null
  >(null)
  const onUsageRef = useRef<((summary: string) => void) | null>(null)
  const onWorkflowRef = useRef<((steps: AgentStep[]) => void) | null>(null)
  const agentStepsRef = useRef<AgentStep[]>(createInitialAgentSteps())
  const pendingToolArgsRef = useRef(
    new Map<string, { name: string; args: Record<string, unknown> }>()
  )
  const agentEndResolve = useRef<(() => void) | null>(null)
  const agentErrorRef = useRef<string | null>(null)
  const abortedRef = useRef(false)
  const diskSessionIdRef = useRef(diskSessionId)
  const systemPromptRef = useRef(systemPrompt)
  const onDiskMessagesReloadRef = useRef(onDiskMessagesReload)
  const onDiskSessionIdReboundRef = useRef(onDiskSessionIdRebound)
  const loadedDiskIdRef = useRef("")

  systemPromptRef.current = systemPrompt
  onDiskMessagesReloadRef.current = onDiskMessagesReload
  onDiskSessionIdReboundRef.current = onDiskSessionIdRebound

  useEffect(() => {
    diskSessionIdRef.current = diskSessionId
  }, [diskSessionId])

  const withSessionLock = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      const run = sessionOp.current.then(fn)
      sessionOp.current = run.then(
        () => undefined,
        () => undefined
      )
      return run
    },
    []
  )

  const applySystemPrompt = useCallback(async (sid: string) => {
    await configureAgentSession(sid, { systemPrompt: systemPromptRef.current })
  }, [])

  const openAgentForDisk = useCallback(
    async (diskId: string) => {
      const running = agentSessionId.current

      if (running && running !== diskId) {
        await destroyAgentSession(running)
        agentSessionId.current = null
        loadedDiskIdRef.current = ""
      }

      if (agentSessionId.current === diskId) {
        await applySystemPrompt(diskId)
        return diskId
      }

      const sid = await createAgentSession({
        diskSessionId: diskId,
      })
      agentSessionId.current = sid
      loadedDiskIdRef.current = diskId
      if (sid !== diskId && diskSessionIdRef.current === diskId) {
        onDiskSessionIdReboundRef.current?.(sid)
      }
      await applySystemPrompt(sid)
      return sid
    },
    [applySystemPrompt]
  )

  useEffect(() => {
    if (!enabled || !diskSessionId) return

    let cancelled = false
    const pushWorkflow = () => {
      onWorkflowRef.current?.([...agentStepsRef.current])
    }

    const unsubscribeEvents = subscribeAgentEvents((payload) => {
      if (payload.sessionId !== agentSessionId.current) return
      const ev = payload.event

      const emitStream = () => {
        if (!activeAssistantId.current || !onStreamRef.current) return
        const display = mergeStreamThinking(
          streamState.current.thinking,
          streamState.current.content
        )
        onStreamRef.current({
          thinking: display.thinking,
          content: display.visible,
          activity: [...activityRef.current],
        })
      }

      const appendThinking = (delta: string) => {
        openTextIdRef.current = null
        const openId = openThinkingIdRef.current
        if (openId) {
          activityRef.current = activityRef.current.map((item) =>
            item.kind === "thinking" && item.id === openId
              ? { ...item, text: item.text + delta }
              : item
          )
          return
        }
        const id = `thinking-${activityRef.current.length}-${Date.now()}`
        openThinkingIdRef.current = id
        activityRef.current = [
          ...activityRef.current,
          { kind: "thinking", id, text: delta },
        ]
      }

      const appendText = (delta: string) => {
        openThinkingIdRef.current = null
        const openId = openTextIdRef.current
        if (openId) {
          activityRef.current = activityRef.current.map((item) =>
            item.kind === "text" && item.id === openId
              ? { ...item, text: item.text + delta }
              : item
          )
          return
        }
        const id = `text-${activityRef.current.length}-${Date.now()}`
        openTextIdRef.current = id
        activityRef.current = [
          ...activityRef.current,
          { kind: "text", id, text: delta },
        ]
      }

      if (ev.type === "agent_start") {
        agentStepsRef.current = createInitialAgentSteps()
        activityRef.current = []
        openThinkingIdRef.current = null
        openTextIdRef.current = null
        pushWorkflow()
      }

      if (ev.type === "turn_start") {
        agentStepsRef.current = setTurnPlanning(agentStepsRef.current)
        pushWorkflow()
      }

      if (ev.type === "message_update") {
        const inner = ev.assistantMessageEvent
        if (inner.type === "thinking_delta" && inner.delta) {
          agentStepsRef.current = setTurnThinking(agentStepsRef.current)
          pushWorkflow()
          appendThinking(inner.delta)
        }
        if (inner.type === "text_delta" && inner.delta) {
          agentStepsRef.current = setTurnResponding(agentStepsRef.current)
          pushWorkflow()
          appendText(inner.delta)
        }
      }

      if (ev.type === "compaction_start") {
        agentStepsRef.current = setCompactionStep(
          agentStepsRef.current,
          "start",
          ev.reason
        )
        pushWorkflow()
      }

      if (ev.type === "compaction_end") {
        agentStepsRef.current = setCompactionStep(
          agentStepsRef.current,
          "end",
          ev.reason
        )
        pushWorkflow()
      }

      if (ev.type === "auto_retry_start") {
        agentStepsRef.current = setRetryStep(agentStepsRef.current, "start", {
          attempt: ev.attempt,
          maxAttempts: ev.maxAttempts,
          errorMessage: ev.errorMessage,
        })
        pushWorkflow()
      }

      if (ev.type === "auto_retry_end") {
        agentStepsRef.current = setRetryStep(agentStepsRef.current, "end", {
          attempt: ev.attempt,
          maxAttempts: ev.attempt,
          success: ev.success,
          errorMessage: ev.finalError,
        })
        pushWorkflow()
      }

      if (ev.type === "tool_execution_start") {
        const args = (ev.args as Record<string, unknown>) ?? {}
        pendingToolArgsRef.current.set(ev.toolCallId, {
          name: ev.toolName,
          args,
        })
        const argsDetail = formatToolArgsSummary(ev.toolName, args)
        agentStepsRef.current = startToolStep(
          agentStepsRef.current,
          ev.toolCallId,
          ev.toolName,
          argsDetail
        )
        pushWorkflow()
        openThinkingIdRef.current = null
        openTextIdRef.current = null
        activityRef.current = [
          ...activityRef.current,
          { kind: "tool", toolCallId: ev.toolCallId },
        ]
        if (activeAssistantId.current && onStreamRef.current) {
          const display = mergeStreamThinking(
            streamState.current.thinking,
            streamState.current.content
          )
          onStreamRef.current({
            thinking: display.thinking,
            content: display.visible,
            activity: [...activityRef.current],
          })
        }
        onToolStartRef.current?.({
          toolCallId: ev.toolCallId,
          name: ev.toolName,
          args,
          status: "running",
          result: "",
        })
      }

      if (ev.type === "tool_execution_update") {
        const preview = formatToolPartialPreview(ev.partialResult)
        if (preview) {
          agentStepsRef.current = updateToolStep(
            agentStepsRef.current,
            ev.toolCallId,
            preview
          )
          pushWorkflow()
        }
        onToolUpdateRef.current?.(ev.toolCallId, preview)
      }

      if (ev.type === "agent_end") {
        const msgs = ev.messages
        const last = [...msgs].reverse().find((m) => m.role === "assistant")
        const failure = extractAgentFailure(
          last && last.role === "assistant" ? last : undefined
        )
        if (failure) agentErrorRef.current = failure
        if (
          last &&
          last.role === "assistant" &&
          !streamState.current.content &&
          !streamState.current.thinking
        ) {
          const fromMsg = textFromAssistantMessage(last as AssistantMessage)
          if (fromMsg.content || fromMsg.thinking) {
            streamState.current = fromMsg
          }
        }
        agentEndResolve.current?.()
        agentEndResolve.current = null
        const reloadId = agentSessionId.current ?? diskSessionIdRef.current
        agentStepsRef.current = markAllDone(agentStepsRef.current)
        pushWorkflow()
        pendingToolArgsRef.current.clear()
        if (reloadId && onDiskMessagesReloadRef.current) {
          void loadPiChatMessages(reloadId)
            .then(onDiskMessagesReloadRef.current)
            .catch((err) => console.warn("[pi-agent] reload messages:", err))
        }
        return
      }

      if (ev.type === "message_end") {
        const failure = extractAgentFailure(
          ev.message.role === "assistant" ? ev.message : undefined
        )
        if (failure) agentErrorRef.current = failure
        if (ev.message.role === "assistant") {
          if ("usage" in ev.message && ev.message.usage) {
            const summary = formatWireUsage(ev.message.usage)
            if (summary) onUsageRef.current?.(summary)
          }
          if (activeAssistantId.current) {
            agentStepsRef.current = setTurnResponding(agentStepsRef.current)
            pushWorkflow()
          }
        }
      }

      if (ev.type === "tool_execution_end") {
        const pending = pendingToolArgsRef.current.get(ev.toolCallId)
        pendingToolArgsRef.current.delete(ev.toolCallId)
        const args = pending?.args ?? {}
        const resultPreview = formatToolResultPreview(ev.result, ev.isError)
        agentStepsRef.current = completeToolStep(
          agentStepsRef.current,
          ev.toolCallId,
          ev.toolName,
          resultPreview,
          ev.isError
        )
        pushWorkflow()
        if (activeAssistantId.current) {
          const resultText =
            typeof ev.result === "string"
              ? ev.result
              : JSON.stringify(ev.result ?? "")
          onToolEndRef.current?.({
            toolCallId: ev.toolCallId,
            name: ev.toolName,
            args,
            status: ev.isError ? "error" : "done",
            result: resultText,
          })
        }
      }

      if (!activeAssistantId.current || !onStreamRef.current) return

      streamState.current = reduceAgentEvent(ev, streamState.current)
      emitStream()
    })

    void withSessionLock(async () => {
      try {
        if (agentSessionId.current !== diskSessionId) {
          await openAgentForDisk(diskSessionId)
        }
        if (cancelled) {
          const sid = agentSessionId.current
          if (sid) await destroyAgentSession(sid)
          agentSessionId.current = null
        }
      } catch (err) {
        console.warn("[pi-agent] init failed:", err)
      }
    })

    return () => {
      cancelled = true
      unsubscribeEvents()
    }
  }, [
    enabled,
    diskSessionId,
    openAgentForDisk,
    withSessionLock,
  ])

  useEffect(() => {
    if (!enabled) return
    void withSessionLock(async () => {
      const sid = agentSessionId.current
      if (!sid) return
      await applySystemPrompt(sid)
    }).catch((err) => console.warn("[pi-agent] system prompt sync:", err))
  }, [systemPrompt, enabled, applySystemPrompt, withSessionLock])

  useEffect(() => {
    return () => {
      const sid = agentSessionId.current
      agentSessionId.current = null
      if (sid) void destroyAgentSession(sid)
    }
  }, [])

  const runPrompt = useCallback(
    async (params: {
      userMessage: string
      images?: ImageContent[]
      assistantId: string
      onReady?: () => void
      onStream: (patch: {
        thinking: string
        content: string
        activity: AssistantActivityItem[]
      }) => void
      onToolStart?: (item: ChatToolCall) => void
      onToolUpdate?: (toolCallId: string, partialResult: string) => void
      onToolEnd?: (item: ChatToolCall) => void
      onUsage?: (summary: string) => void
      onWorkflow?: (steps: AgentStep[]) => void
    }): Promise<{ content: string; thinking: string }> => {
      return withSessionLock(async () => {
        const diskId = diskSessionIdRef.current
        if (!diskId) throw new Error("请先选择或创建对话")
        if (agentSessionId.current !== diskId) {
          await openAgentForDisk(diskId)
        }
        const agentId = agentSessionId.current
        if (!agentId) throw new Error("Agent 未就绪，请稍后重试")

        params.onReady?.()
        onStreamRef.current = params.onStream
        onToolStartRef.current = params.onToolStart ?? null
        onToolUpdateRef.current = params.onToolUpdate ?? null
        onToolEndRef.current = params.onToolEnd ?? null
        onUsageRef.current = params.onUsage ?? null
        onWorkflowRef.current = params.onWorkflow ?? null
        activeAssistantId.current = params.assistantId
        streamState.current = { content: "", thinking: "" }
        activityRef.current = []
        openThinkingIdRef.current = null
        openTextIdRef.current = null
        agentStepsRef.current = createInitialAgentSteps()
        pendingToolArgsRef.current.clear()
        params.onWorkflow?.(agentStepsRef.current)
        agentErrorRef.current = null
        abortedRef.current = false

        try {
          await pushRuntimeSettingsToMain()
          await applySystemPrompt(agentId)

          const idle = new Promise<void>((resolve, reject) => {
            agentEndResolve.current = () => {
              if (abortedRef.current) {
                resolve()
                return
              }
              if (agentErrorRef.current) {
                reject(new Error(agentErrorRef.current))
                return
              }
              resolve()
            }
          })

          try {
            await promptAgent(agentId, params.userMessage, params.images)
          } catch (error) {
            agentEndResolve.current = null
            throw error
          }

          await idle

          const display = mergeStreamThinking(
            streamState.current.thinking,
            streamState.current.content
          )
          return { content: display.visible, thinking: display.thinking }
        } finally {
          activeAssistantId.current = null
          onStreamRef.current = null
          onToolStartRef.current = null
          onToolUpdateRef.current = null
          onToolEndRef.current = null
          onUsageRef.current = null
          onWorkflowRef.current = null
          agentEndResolve.current = null
        }
      })
    },
    [applySystemPrompt, withSessionLock, openAgentForDisk]
  )

  const abort = useCallback(() => {
    const sid = agentSessionId.current
    if (sid) abortAgentSession(sid)
    abortedRef.current = true
    agentEndResolve.current?.()
    agentEndResolve.current = null
    activeAssistantId.current = null
    onStreamRef.current = null
    onToolStartRef.current = null
    onToolUpdateRef.current = null
    onToolEndRef.current = null
    onUsageRef.current = null
    onWorkflowRef.current = null
    streamState.current = { content: "", thinking: "" }
    activityRef.current = []
    openThinkingIdRef.current = null
    openTextIdRef.current = null
  }, [])

  const resetAgent = useCallback(
    async (_history = [], overrideDiskId?: string) => {
      const diskId = overrideDiskId ?? diskSessionIdRef.current
      await withSessionLock(async () => {
        if (!diskId) {
          const prev = agentSessionId.current
          if (prev) await destroyAgentSession(prev)
          agentSessionId.current = null
          return
        }
        const prev = agentSessionId.current
        if (prev && prev !== diskId) {
          await destroyAgentSession(prev)
          agentSessionId.current = null
        }
        await openAgentForDisk(diskId)
      })
    },
    [openAgentForDisk, withSessionLock]
  )

  return { runPrompt, abort, resetAgent }
}
