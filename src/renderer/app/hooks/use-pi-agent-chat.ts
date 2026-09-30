import { useCallback, useEffect, useRef } from "react"
import {
  type AssistantActivityItem,
  type ChatToolCall,
  formatToolPartialPreview,
  mergeStreamThinking,
  patchCompactionActivity,
  patchRetryActivity,
} from "~/lib/agent-steps"
import {
  reduceAgentEvent,
  textFromAssistantMessage,
} from "~/lib/pi-agent-events"
import { createRafBatcher } from "~/lib/raf-stream-patch"
import { extractAgentFailure } from "~/services/agent-failure"
import {
  abortAgentSession,
  agentSessionExists,
  createAgentSession,
  destroyAgentSession,
  promptAgent,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import { loadPiChatMessages } from "~/services/pi-chat-sessions"
import { pushRuntimeSettingsToMain } from "~/services/settings"
import type { useAppStore } from "~/stores/app-store"
import { formatWireUsage } from "../../../shared/chat-wire"
import {
  activityFromAssistantContent,
  mergeAssistantActivity,
} from "../../../shared/pi-assistant-activity"
import type { AssistantMessage, ImageContent } from "../../../shared/pi-sdk"

type UsePiAgentChatOptions = {
  diskSessionId: string | null
  enabled: boolean
  onDiskMessagesReload?: (
    messages: ReturnType<typeof useAppStore.getState>["conversationHistory"]
  ) => void
  /** 磁盘会话 id 失效后主进程新建会话时回写 UI */
  onDiskSessionIdRebound?: (newId: string) => void
}

export function usePiAgentChat({
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
    | ((patch: {
        thinking: string
        content: string
        activity: AssistantActivityItem[]
        toolCalls: ChatToolCall[]
      }) => void)
    | null
  >(null)
  const toolCallsRef = useRef<ChatToolCall[]>([])
  const onUsageRef = useRef<((summary: string) => void) | null>(null)
  const pendingToolArgsRef = useRef(
    new Map<string, { name: string; args: Record<string, unknown> }>()
  )
  const agentEndResolve = useRef<(() => void) | null>(null)
  const agentErrorRef = useRef<string | null>(null)
  const abortedRef = useRef(false)
  const diskSessionIdRef = useRef(diskSessionId)
  const onDiskMessagesReloadRef = useRef(onDiskMessagesReload)
  const onDiskSessionIdReboundRef = useRef(onDiskSessionIdRebound)
  const loadedDiskIdRef = useRef("")

  onDiskMessagesReloadRef.current = onDiskMessagesReload
  onDiskSessionIdReboundRef.current = onDiskSessionIdRebound

  useEffect(() => {
    diskSessionIdRef.current = diskSessionId
  }, [diskSessionId])

  const withSessionLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const run = sessionOp.current.then(fn)
    sessionOp.current = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  const openAgentForDisk = useCallback(async (diskId: string) => {
    const running = agentSessionId.current

    if (running && running !== diskId) {
      await destroyAgentSession(running)
      agentSessionId.current = null
      loadedDiskIdRef.current = ""
    }

    if (agentSessionId.current === diskId) {
      if (await agentSessionExists(diskId)) return diskId
      agentSessionId.current = null
    }

    const sid = await createAgentSession({
      diskSessionId: diskId,
    })
    agentSessionId.current = sid
    loadedDiskIdRef.current = diskId
    if (sid !== diskId && diskSessionIdRef.current === diskId) {
      onDiskSessionIdReboundRef.current?.(sid)
    }
    return sid
  }, [])

  const upsertToolCall = (item: ChatToolCall) => {
    const list = toolCallsRef.current
    const idx = list.findIndex((t) => t.toolCallId === item.toolCallId)
    if (idx >= 0) list[idx] = { ...list[idx], ...item }
    else list.push(item)
  }

  const streamBatchRef = useRef(
    createRafBatcher<{
      thinking: string
      content: string
      activity: AssistantActivityItem[]
      toolCalls: ChatToolCall[]
    }>((patch) => {
      onStreamRef.current?.(patch)
    })
  )

  const emitUiPatch = () => {
    if (!activeAssistantId.current || !onStreamRef.current) return
    const display = mergeStreamThinking(
      streamState.current.thinking,
      streamState.current.content
    )
    streamBatchRef.current.push({
      thinking: display.thinking,
      content: display.visible,
      activity: [...activityRef.current],
      toolCalls: [...toolCallsRef.current],
    })
  }

  const syncActivityFromPiAssistant = (message: AssistantMessage) => {
    const ts = "timestamp" in message ? Number(message.timestamp) : Date.now()
    const fromPi = activityFromAssistantContent(message.content, ts)
    const workflows = activityRef.current.filter((a) => a.kind === "workflow")
    if (fromPi.activity.length > 0) {
      activityRef.current = mergeAssistantActivity(
        activityRef.current,
        fromPi.activity
      )
      for (const w of workflows) {
        if (
          !activityRef.current.some(
            (a) => a.kind === "workflow" && a.id === w.id
          )
        ) {
          activityRef.current = [...activityRef.current, w]
        }
      }
    }
    if (fromPi.toolCalls.length > 0) {
      for (const t of fromPi.toolCalls) {
        upsertToolCall(t)
      }
    }
  }

  const emitUiPatchRef = useRef(emitUiPatch)
  const syncActivityFromPiAssistantRef = useRef(syncActivityFromPiAssistant)
  emitUiPatchRef.current = emitUiPatch
  syncActivityFromPiAssistantRef.current = syncActivityFromPiAssistant

  useEffect(() => {
    if (!enabled || !diskSessionId) return

    let cancelled = false

    const unsubscribeEvents = subscribeAgentEvents((payload) => {
      if (payload.sessionId !== agentSessionId.current) return
      const ev = payload.event

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
        activityRef.current = []
        toolCallsRef.current = []
        openThinkingIdRef.current = null
        openTextIdRef.current = null
      }

      if (ev.type === "message_update") {
        const inner = ev.assistantMessageEvent
        if (inner.type === "thinking_delta" && inner.delta) {
          appendThinking(inner.delta)
        }
        if (inner.type === "text_delta" && inner.delta) {
          appendText(inner.delta)
        }
      }

      if (ev.type === "compaction_start") {
        activityRef.current = patchCompactionActivity(
          activityRef.current,
          "start",
          ev.reason
        )
        emitUiPatchRef.current()
      }

      if (ev.type === "compaction_end") {
        activityRef.current = patchCompactionActivity(
          activityRef.current,
          "end",
          ev.reason
        )
        emitUiPatchRef.current()
      }

      if (ev.type === "auto_retry_start") {
        activityRef.current = patchRetryActivity(activityRef.current, "start", {
          attempt: ev.attempt,
          maxAttempts: ev.maxAttempts,
          errorMessage: ev.errorMessage,
        })
        emitUiPatchRef.current()
      }

      if (ev.type === "auto_retry_end") {
        activityRef.current = patchRetryActivity(activityRef.current, "end", {
          attempt: ev.attempt,
          success: ev.success,
          errorMessage: ev.finalError,
        })
        emitUiPatchRef.current()
      }

      if (ev.type === "tool_execution_start") {
        const args = (ev.args as Record<string, unknown>) ?? {}
        pendingToolArgsRef.current.set(ev.toolCallId, {
          name: ev.toolName,
          args,
        })
        openThinkingIdRef.current = null
        openTextIdRef.current = null
        if (
          !activityRef.current.some(
            (a) => a.kind === "tool" && a.toolCallId === ev.toolCallId
          )
        ) {
          activityRef.current = [
            ...activityRef.current,
            { kind: "tool", toolCallId: ev.toolCallId },
          ]
        }
        upsertToolCall({
          toolCallId: ev.toolCallId,
          name: ev.toolName,
          args,
          status: "running",
          result: "",
        })
        emitUiPatchRef.current()
      }

      if (ev.type === "tool_execution_update") {
        const preview = formatToolPartialPreview(ev.partialResult)
        if (preview) {
          const current = toolCallsRef.current.find(
            (t) => t.toolCallId === ev.toolCallId
          )
          if (current) {
            upsertToolCall({
              ...current,
              partialResult: preview,
              status: "running",
            })
            emitUiPatchRef.current()
          }
        }
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
            syncActivityFromPiAssistantRef.current(
              ev.message as AssistantMessage
            )
            emitUiPatchRef.current()
          }
        }
      }

      if (ev.type === "tool_execution_end") {
        const pending = pendingToolArgsRef.current.get(ev.toolCallId)
        pendingToolArgsRef.current.delete(ev.toolCallId)
        const args = pending?.args ?? {}
        const resultText =
          typeof ev.result === "string"
            ? ev.result
            : JSON.stringify(ev.result ?? "")
        upsertToolCall({
          toolCallId: ev.toolCallId,
          name: ev.toolName,
          args,
          status: ev.isError ? "error" : "done",
          result: resultText,
        })
        emitUiPatchRef.current()
      }

      if (!activeAssistantId.current || !onStreamRef.current) return

      streamState.current = reduceAgentEvent(ev, streamState.current)
      emitUiPatchRef.current()
    })

    void withSessionLock(async () => {
      try {
        const live =
          agentSessionId.current === diskSessionId &&
          (await agentSessionExists(diskSessionId))
        if (!live) {
          agentSessionId.current = null
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
      streamBatchRef.current.cancel()
    }
  }, [enabled, diskSessionId, openAgentForDisk])

  useEffect(() => {
    return () => {
      const sid = agentSessionId.current
      agentSessionId.current = null
      if (sid) void destroyAgentSession(sid)
    }
  }, [])

  const runPrompt = async (params: {
    userMessage: string
    images?: ImageContent[]
    assistantId: string
    onReady?: () => void
    onStream: (patch: {
      thinking: string
      content: string
      activity: AssistantActivityItem[]
      toolCalls: ChatToolCall[]
    }) => void
    onUsage?: (summary: string) => void
  }): Promise<{ content: string; thinking: string }> => {
    return withSessionLock(async () => {
        const diskId = diskSessionIdRef.current
        if (!diskId) throw new Error("请先选择或创建对话")
        await openAgentForDisk(diskId)
        const agentId = agentSessionId.current
        if (!agentId) throw new Error("Agent 未就绪，请稍后重试")

        params.onReady?.()
        onStreamRef.current = params.onStream
        onUsageRef.current = params.onUsage ?? null
        activeAssistantId.current = params.assistantId
        streamState.current = { content: "", thinking: "" }
        activityRef.current = []
        toolCallsRef.current = []
        openThinkingIdRef.current = null
        openTextIdRef.current = null
        pendingToolArgsRef.current.clear()
        agentErrorRef.current = null
        abortedRef.current = false

        try {
          await pushRuntimeSettingsToMain()

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
          streamBatchRef.current.flush()
          activeAssistantId.current = null
          onStreamRef.current = null
          onUsageRef.current = null
          agentEndResolve.current = null
        }
      })
  }

  const abort = () => {
    const sid = agentSessionId.current
    if (sid) abortAgentSession(sid)
    abortedRef.current = true
    agentEndResolve.current?.()
    agentEndResolve.current = null
    activeAssistantId.current = null
    onStreamRef.current = null
    onUsageRef.current = null
    streamState.current = { content: "", thinking: "" }
    activityRef.current = []
    toolCallsRef.current = []
    openThinkingIdRef.current = null
    openTextIdRef.current = null
  }

  const resetAgent = useCallback(async (_history = [], overrideDiskId?: string) => {
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
  }, [openAgentForDisk])

  return { runPrompt, abort, resetAgent }
}
