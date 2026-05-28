import { useCallback, useEffect, useRef } from "react"

import { mergeStreamThinking } from "~/lib/agent-steps"
import { reduceAgentEvent } from "~/lib/pi-agent-events"
import {
  abortAgentSession,
  configureAgentSession,
  createAgentSession,
  destroyAgentSession,
  promptAgent,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import type { ChatMessage } from "~/stores/app-store"

type UsePiAgentChatOptions = {
  systemPrompt: string
  messages: ChatMessage[]
  enabled: boolean
}

export function usePiAgentChat({
  systemPrompt,
  messages,
  enabled,
}: UsePiAgentChatOptions) {
  const agentSessionId = useRef<string | null>(null)
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

  const syncAgentContext = useCallback(async () => {
    const sid = agentSessionId.current
    if (!sid) return
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    await configureAgentSession(sid, { systemPrompt, messages: history })
  }, [messages, systemPrompt])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const unsubscribeEvents = subscribeAgentEvents((payload) => {
      if (payload.sessionId !== agentSessionId.current) return

      if (payload.event.type === "agent_end") {
        agentEndResolve.current?.()
        agentEndResolve.current = null
        return
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

    ;(async () => {
      try {
        const sid = await createAgentSession()
        if (cancelled) {
          await destroyAgentSession(sid)
          return
        }
        agentSessionId.current = sid
        await syncAgentContext()
      } catch (err) {
        console.warn("[pi-agent] init failed:", err)
      }
    })()

    return () => {
      cancelled = true
      unsubscribeEvents()
      const sid = agentSessionId.current
      agentSessionId.current = null
      if (sid) void destroyAgentSession(sid)
    }
  }, [enabled, syncAgentContext])

  useEffect(() => {
    if (!enabled || !agentSessionId.current) return
    void syncAgentContext().catch((err) =>
      console.warn("[pi-agent] sync context failed:", err)
    )
  }, [enabled, syncAgentContext])

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
      const sid = agentSessionId.current
      if (!sid) throw new Error("Agent 未就绪，请稍后重试")

      onStreamRef.current = params.onStream
      onToolCallRef.current = params.onToolCall
      activeAssistantId.current = params.assistantId
      streamState.current = { content: "", thinking: "" }

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

      await configureAgentSession(sid, { systemPrompt, messages: history })

      const idle = new Promise<void>((resolve) => {
        agentEndResolve.current = resolve
      })
      await promptAgent(sid, params.userMessage)
      await idle

      const display = mergeStreamThinking(
        streamState.current.thinking,
        streamState.current.content
      )
      activeAssistantId.current = null
      onStreamRef.current = null
      onToolCallRef.current = null
      return { content: display.visible, thinking: display.thinking }
    },
    [syncAgentContext]
  )

  const abort = useCallback(() => {
    const sid = agentSessionId.current
    if (sid) abortAgentSession(sid)
    agentEndResolve.current?.()
    agentEndResolve.current = null
    activeAssistantId.current = null
    onStreamRef.current = null
    onToolCallRef.current = null
    streamState.current = { content: "", thinking: "" }
  }, [])

  const resetAgent = useCallback(async () => {
    const sid = agentSessionId.current
    if (sid) await destroyAgentSession(sid)
    agentSessionId.current = await createAgentSession()
    await configureAgentSession(agentSessionId.current, {
      systemPrompt,
      messages: [],
    })
  }, [systemPrompt])

  return { runPrompt, abort, resetAgent }
}
