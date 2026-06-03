import type { AgentMessage } from "../../../shared/pi-sdk"
import { parseModelThinking } from "~/lib/agent-steps"
import {
  configureAgentSession,
  createAgentSession,
  destroyAgentSession,
  promptAgent,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import { deletePiChatSession } from "~/services/pi-chat-sessions"
import { pushRuntimeSettingsToMain } from "~/services/settings"

const DEFAULT_TIMEOUT_MS = 120_000

export type AgentPromptMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export function messagesToAgentRequest(messages: AgentPromptMessage[]): {
  systemPrompt: string
  userMessage: string
} {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean)
  const dialogue = messages.filter((m) => m.role !== "system")

  if (dialogue.length === 0) {
    return {
      systemPrompt: systemParts.join("\n\n"),
      userMessage: "请根据系统说明完成任务。",
    }
  }

  const last = dialogue[dialogue.length - 1]
  if (dialogue.length === 1 && last.role === "user") {
    return {
      systemPrompt: systemParts.join("\n\n"),
      userMessage: last.content,
    }
  }

  const prior = dialogue.slice(0, -1)
  const transcript = prior
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：\n${m.content}`)
    .join("\n\n")
  const systemPrompt = [
    systemParts.join("\n\n"),
    prior.length > 0 ? `## 对话记录\n${transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const userMessage =
    last.role === "user"
      ? last.content
      : `${transcript}\n\n请继续完成上述任务。`

  return { systemPrompt, userMessage }
}

function textFromAssistantMessage(message: AgentMessage): {
  content: string
  thinking: string
} {
  if (message.role !== "assistant") {
    return { content: "", thinking: "" }
  }
  if (!Array.isArray(message.content)) {
    return { content: "", thinking: "" }
  }
  let content = ""
  let thinking = ""
  for (const block of message.content) {
    if (block.type === "text") content += block.text
    if (block.type === "thinking") thinking += block.thinking
  }
  return { content, thinking }
}

function extractFromAgentEnd(messages: AgentMessage[]): {
  content: string
  thinking: string
} {
  const last = [...messages].reverse().find((m) => m.role === "assistant")
  if (!last || last.role !== "assistant") {
    return { content: "", thinking: "" }
  }
  const { content, thinking } = textFromAssistantMessage(last)
  const parsed = parseModelThinking(content)
  return {
    content: parsed.visible || content,
    thinking: thinking || parsed.thinking,
  }
}

export async function promptAgentOnce(
  messages: AgentPromptMessage[],
  options?: { timeoutMs?: number }
): Promise<{ content: string; thinking: string }> {
  const { systemPrompt, userMessage } = messagesToAgentRequest(messages)
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let agentSessionId: string | null = null
  let disposeAgentListener: (() => void) | undefined

  try {
    await pushRuntimeSettingsToMain()
    const sessionId = await createAgentSession({ createNew: true })
    agentSessionId = sessionId
    await configureAgentSession(sessionId, { systemPrompt })

    const result = await new Promise<{ content: string; thinking: string }>(
      (resolve, reject) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          fn()
        }

        timer = setTimeout(() => {
          finish(() => reject(new Error("Agent 响应超时")))
        }, timeoutMs)

        disposeAgentListener = subscribeAgentEvents((payload) => {
          if (payload.sessionId !== sessionId) return
          const ev = payload.event
          if (ev.type !== "agent_end") return
          const failure = ev.messages
            .slice()
            .reverse()
            .find((m) => m.role === "assistant")
          if (
            failure &&
            failure.role === "assistant" &&
            (failure.stopReason === "error" || failure.errorMessage)
          ) {
            finish(() =>
              reject(
                new Error(
                  failure.errorMessage?.trim() || "模型调用失败"
                )
              )
            )
            return
          }
          finish(() => resolve(extractFromAgentEnd(ev.messages)))
        })

        void promptAgent(sessionId, userMessage).catch((err) => {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))))
        })
      }
    )

    return result
  } finally {
    disposeAgentListener?.()
    if (agentSessionId) {
      await destroyAgentSession(agentSessionId).catch(() => {})
      await deletePiChatSession(agentSessionId).catch(() => {})
    }
  }
}

/** 兼容旧 chat(messages) 签名 */
export async function agentChat(
  messages: AgentPromptMessage[]
): Promise<string> {
  const { content } = await promptAgentOnce(messages)
  return content
}
