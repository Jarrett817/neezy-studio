import { useCallback, useEffect, useRef } from "react"

import {
  completeToolStep,
  createInitialAgentSteps,
  formatToolArgsSummary,
  formatToolPartialPreview,
  formatToolResultPreview,
  formatUsageSummary,
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
  type ChatToolCall,
} from "~/lib/agent-steps"
import { reduceAgentEvent } from "~/lib/pi-agent-events"
import { useAppStore } from "~/stores/app-store"
import {
  abortAgentSession,
  configureAgentSession,
  createAgentSession,
  destroyAgentSession,
  promptAgent,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import {
  listPiChatSessions,
  loadPiChatMessages,
} from "~/services/pi-chat-sessions"
import { pushRuntimeSettingsToMain } from "~/services/settings"

const AGENT_PROMPT_TIMEOUT_MS = 120_000

type UsePiAgentChatOptions = {
  systemPrompt: string
  diskSessionId: string | null
  enabled: boolean
  onDiskMessagesReload?: (messages: ReturnType<typeof useAppStore.getState>["conversationHistory"]) => void
  /** 磁盘会话 id 失效后主进程新建会话时回写 UI */
  onDiskSessionIdRebound?: (newId: string) => void
}

function extractAgentFailure(
  message: { stopReason?: string; errorMessage?: string } | undefined
): string | null {
  if (!message) return null
  if (message.stopReason === "error" || message.errorMessage) {
    return message.errorMessage?.trim() || "模型调用失败"
  }
  return null
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
  const onStreamRef = useRef<
    ((patch: { thinking: string; content: string }) => void) | null
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

  diskSessionIdRef.current = diskSessionId
  systemPromptRef.current = systemPrompt
  onDiskMessagesReloadRef.current = onDiskMessagesReload
  onDiskSessionIdReboundRef.current = onDiskSessionIdRebound

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
      const sessions = await listPiChatSessions()
      const diskOnFile = sessions.some((s) => s.id === diskId)
      const runningOnFile = running
        ? sessions.some((s) => s.id === running)
        : false

      // 父组件仍是陈旧 kv id，但 Agent 已绑定到恢复后的磁盘会话：不要销毁再建
      if (running && runningOnFile && !diskOnFile) {
        diskSessionIdRef.current = running
        onDiskSessionIdReboundRef.current?.(running)
        await applySystemPrompt(running)
        return running
      }

      if (running && running !== diskId) {
        await destroyAgentSession(running)
        agentSessionId.current = null
      }

      if (agentSessionId.current === diskId) {
        await applySystemPrompt(diskId)
        return diskId
      }

      const sid = await createAgentSession({ diskSessionId: diskId })
      agentSessionId.current = sid
      if (sid !== diskId) {
        diskSessionIdRef.current = sid
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

      if (ev.type === "agent_start") {
        agentStepsRef.current = createInitialAgentSteps()
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
        }
        if (inner.type === "text_delta" && inner.delta) {
          agentStepsRef.current = setTurnResponding(agentStepsRef.current)
          pushWorkflow()
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
        agentEndResolve.current?.()
        agentEndResolve.current = null
        const reloadId = diskSessionIdRef.current
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
            onUsageRef.current?.(formatUsageSummary(ev.message.usage))
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
      const display = mergeStreamThinking(
        streamState.current.thinking,
        streamState.current.content
      )
      onStreamRef.current({
        thinking: display.thinking,
        content: display.visible,
      })
    })

    void withSessionLock(async () => {
      try {
        await openAgentForDisk(diskSessionId)
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
  }, [enabled, diskSessionId, openAgentForDisk, withSessionLock])

  useEffect(() => {
    const sid = agentSessionId.current
    if (!sid || !enabled) return
    void applySystemPrompt(sid).catch((err) =>
      console.warn("[pi-agent] system prompt sync:", err)
    )
  }, [systemPrompt, enabled, applySystemPrompt])

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
      assistantId: string
      onStream: (patch: { thinking: string; content: string }) => void
      onToolStart?: (item: ChatToolCall) => void
      onToolUpdate?: (toolCallId: string, partialResult: string) => void
      onToolEnd?: (item: ChatToolCall) => void
      onUsage?: (summary: string) => void
      onWorkflow?: (steps: AgentStep[]) => void
    }): Promise<{ content: string; thinking: string }> => {
      return withSessionLock(async () => {
        const diskId = diskSessionIdRef.current
        if (!diskId) throw new Error("请先选择或创建对话")
        if (!agentSessionId.current) {
          await openAgentForDisk(diskId)
        }
        const agentId = agentSessionId.current
        if (!agentId) throw new Error("Agent 未就绪，请稍后重试")

        onStreamRef.current = params.onStream
        onToolStartRef.current = params.onToolStart ?? null
        onToolUpdateRef.current = params.onToolUpdate ?? null
        onToolEndRef.current = params.onToolEnd ?? null
        onUsageRef.current = params.onUsage ?? null
        onWorkflowRef.current = params.onWorkflow ?? null
        activeAssistantId.current = params.assistantId
        streamState.current = { content: "", thinking: "" }
        agentStepsRef.current = createInitialAgentSteps()
        pendingToolArgsRef.current.clear()
        params.onWorkflow?.(agentStepsRef.current)
        agentErrorRef.current = null
        abortedRef.current = false

        let timeoutId: ReturnType<typeof setTimeout> | undefined

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

          timeoutId = setTimeout(() => {
            agentErrorRef.current =
              agentErrorRef.current ?? "模型响应超时，请检查网络或 API 配置"
            agentEndResolve.current?.()
            agentEndResolve.current = null
          }, AGENT_PROMPT_TIMEOUT_MS)

          try {
            await promptAgent(agentId, params.userMessage)
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
          if (timeoutId) clearTimeout(timeoutId)
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
  }, [])

  const resetAgent = useCallback(
    async (_history = [], overrideDiskId?: string) => {
      const diskId = overrideDiskId ?? diskSessionIdRef.current
      if (!diskId) {
        const prev = agentSessionId.current
        if (prev) await destroyAgentSession(prev)
        agentSessionId.current = null
        return
      }
      await withSessionLock(() => openAgentForDisk(diskId))
    },
    [openAgentForDisk, withSessionLock]
  )

  return { runPrompt, abort, resetAgent }
}
