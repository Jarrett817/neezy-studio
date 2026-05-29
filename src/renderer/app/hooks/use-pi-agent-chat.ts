import { useCallback, useEffect, useRef } from "react"

import { mergeStreamThinking } from "~/lib/agent-steps"
import { reduceAgentEvent } from "~/lib/pi-agent-events"
import { useAppStore, type ChatMessage } from "~/stores/app-store"
import {
  abortAgentSession,
  configureAgentSession,
  createAgentSession,
  destroyAgentSession,
  promptAgent,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import { pushRuntimeSettingsToMain } from "~/services/settings"

const AGENT_PROMPT_TIMEOUT_MS = 120_000

type UsePiAgentChatOptions = {
  systemPrompt: string
  messages: ChatMessage[]
  enabled: boolean
}

function toAgentHistory(messages: ChatMessage[]) {
  return messages
    .filter(
      (m) =>
        m.role === "user" ||
        (m.role === "assistant" &&
          !m.isStreaming &&
          m.content.trim().length > 0)
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))
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
  messages,
  enabled,
}: UsePiAgentChatOptions) {
  const agentSessionId = useRef<string | null>(null)
  const sessionOp = useRef<Promise<void>>(Promise.resolve())
  const activeAssistantId = useRef<string | null>(null)
  const streamState = useRef({ content: "", thinking: "" })
  const onStreamRef = useRef<
    ((patch: { thinking: string; content: string }) => void) | null
  >(null)
  const onToolCallRef = useRef<
    | ((
        name: string,
        args: Record<string, unknown>,
        result: string
      ) => void)
    | null
  >(null)
  const agentEndResolve = useRef<(() => void) | null>(null)
  const agentErrorRef = useRef<string | null>(null)
  const abortedRef = useRef(false)
  const promptInFlightRef = useRef(false)

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

  const applyAgentConfigure = useCallback(
    async (sid: string, history: { role: "user" | "assistant"; content: string }[]) => {
      try {
        await configureAgentSession(sid, { systemPrompt, messages: history })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!msg.includes("session not found")) throw error
        const fresh = await createAgentSession()
        agentSessionId.current = fresh
        await configureAgentSession(fresh, { systemPrompt, messages: history })
      }
    },
    [systemPrompt]
  )

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const unsubscribeEvents = subscribeAgentEvents((payload) => {
      if (payload.sessionId !== agentSessionId.current) return

      if (payload.event.type === "agent_end") {
        const msgs = payload.event.messages as
          | { role?: string; stopReason?: string; errorMessage?: string }[]
          | undefined
        const last = Array.isArray(msgs)
          ? [...msgs].reverse().find((m) => m.role === "assistant")
          : undefined
        const failure = extractAgentFailure(last)
        if (failure) agentErrorRef.current = failure
        agentEndResolve.current?.()
        agentEndResolve.current = null
        return
      }

      if (payload.event.type === "message_end") {
        const failure = extractAgentFailure(
          payload.event.message as { stopReason?: string; errorMessage?: string }
        )
        if (failure) agentErrorRef.current = failure
      }

      if (
        payload.event.type === "tool_execution_end" &&
        activeAssistantId.current &&
        onToolCallRef.current
      ) {
        const ev = payload.event as unknown as {
          toolName: string
          args: unknown
          result: unknown
        }
        const resultText =
          typeof ev.result === "string"
            ? ev.result
            : JSON.stringify(ev.result ?? "")
        onToolCallRef.current(
          ev.toolName,
          (ev.args as Record<string, unknown>) ?? {},
          resultText
        )
      }

      if (!activeAssistantId.current || !onStreamRef.current) return

      streamState.current = reduceAgentEvent(payload.event, streamState.current)
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
        const sid = await createAgentSession()
        if (cancelled) {
          await destroyAgentSession(sid)
          return
        }
        agentSessionId.current = sid
        const history = toAgentHistory(
          useAppStore.getState().conversationHistory
        )
        await applyAgentConfigure(sid, history)
      } catch (err) {
        console.warn("[pi-agent] init failed:", err)
      }
    })

    return () => {
      cancelled = true
      unsubscribeEvents()
      const sid = agentSessionId.current
      agentSessionId.current = null
      if (sid) {
        void withSessionLock(() => destroyAgentSession(sid))
      }
    }
  }, [enabled, applyAgentConfigure, withSessionLock])

  const runPrompt = useCallback(
    async (params: {
      userMessage: string
      assistantId: string
      onStream: (patch: { thinking: string; content: string }) => void
      onToolCall: (
        name: string,
        args: Record<string, unknown>,
        result: string
      ) => void
    }): Promise<{ content: string; thinking: string }> => {
      return withSessionLock(async () => {
        const sid = agentSessionId.current
        if (!sid) throw new Error("Agent 未就绪，请稍后重试")

        onStreamRef.current = params.onStream
        onToolCallRef.current = params.onToolCall
        activeAssistantId.current = params.assistantId
        streamState.current = { content: "", thinking: "" }
        agentErrorRef.current = null
        abortedRef.current = false

        const withoutAssistant = messages.filter(
          (m) => m.id !== params.assistantId && m.role !== "error"
        )
        const forAgent = withoutAssistant.filter(
          (m) =>
            m.role === "user" ||
            (m.role === "assistant" && m.content.trim().length > 0)
        )
        const last = forAgent[forAgent.length - 1]
        const history =
          last?.role === "user"
            ? forAgent.slice(0, -1).map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              }))
            : forAgent.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              }))

        let timeoutId: ReturnType<typeof setTimeout> | undefined
        promptInFlightRef.current = true

        try {
          await pushRuntimeSettingsToMain()
          await applyAgentConfigure(sid, history)

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
            await promptAgent(sid, params.userMessage)
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
          promptInFlightRef.current = false
          if (timeoutId) clearTimeout(timeoutId)
          activeAssistantId.current = null
          onStreamRef.current = null
          onToolCallRef.current = null
          agentEndResolve.current = null
        }
      })
    },
    [systemPrompt, messages, applyAgentConfigure, withSessionLock]
  )

  const abort = useCallback(() => {
    const sid = agentSessionId.current
    if (sid) abortAgentSession(sid)
    abortedRef.current = true
    agentEndResolve.current?.()
    agentEndResolve.current = null
    activeAssistantId.current = null
    onStreamRef.current = null
    onToolCallRef.current = null
    streamState.current = { content: "", thinking: "" }
  }, [])

  const resetAgent = useCallback(
    async (history: ChatMessage[] = []) => {
      await withSessionLock(async () => {
        const sid = agentSessionId.current
        if (sid) await destroyAgentSession(sid)
        const fresh = await createAgentSession()
        agentSessionId.current = fresh
        await applyAgentConfigure(fresh, toAgentHistory(history))
      })
    },
    [applyAgentConfigure, withSessionLock]
  )

  return { runPrompt, abort, resetAgent }
}
