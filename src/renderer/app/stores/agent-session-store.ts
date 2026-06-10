import { create } from "zustand"

import type { AgentEventPayload } from "~/services/pi-agent-client"
import {
  createAgentSession,
  configureAgentSession,
  promptAgent,
  abortAgentSession,
  destroyAgentSession,
  subscribeAgentEvents,
} from "~/services/pi-agent-client"
import type { ChatMessage } from "./app-store"

export interface ToolExecution {
  toolCallId: string
  toolName: string
  status: "running" | "done" | "error"
  args?: Record<string, unknown>
  result?: string
}

interface AgentSessionState {
  /** 当前 session ID（pi-agent 磁盘 session） */
  sessionId: string | null
  /** 是否正在 streaming */
  isStreaming: boolean
  /** 当前正在执行的工具 */
  activeTools: ToolExecution[]
  /** 绑定的 playbook/profile ID（场景模式） */
  boundPlaybookId: string | null
  /** 事件监听器 dispose 函数 */
  _unsubscribe: (() => void) | null
  /** 最后一次错误 */
  lastError: string | null
}

interface AgentSessionActions {
  /** 创建或恢复 session */
  initSession: (options?: {
    diskSessionId?: string
    createNew?: boolean
    playbookId?: string
    systemPrompt?: string
  }) => Promise<string>
  /** 发送 prompt（编译后的 user message） */
  sendPrompt: (message: string) => Promise<void>
  /** 中断当前运行 */
  abort: () => void
  /** 销毁 session */
  destroy: () => Promise<void>
  /** 处理 agent 事件（内部） */
  _handleEvent: (payload: AgentEventPayload) => void
  /** 重置状态 */
  reset: () => void
}

type AgentSessionStore = AgentSessionState & AgentSessionActions

const INITIAL_STATE: AgentSessionState = {
  sessionId: null,
  isStreaming: false,
  activeTools: [],
  boundPlaybookId: null,
  _unsubscribe: null,
  lastError: null,
}

export const useAgentSessionStore = create<AgentSessionStore>()((set, get) => ({
  ...INITIAL_STATE,

  initSession: async (options = {}) => {
    const current = get()
    // 如果已有同 playbook 的 session，复用
    if (
      current.sessionId &&
      options.playbookId &&
      current.boundPlaybookId === options.playbookId
    ) {
      return current.sessionId
    }

    // 清理旧 session listener
    current._unsubscribe?.()

    const sessionId = await createAgentSession({
      diskSessionId: options.diskSessionId,
      createNew: options.createNew ?? !options.diskSessionId,
    })

    if (options.systemPrompt) {
      await configureAgentSession(sessionId, { systemPrompt: options.systemPrompt })
    }

    const unsubscribe = subscribeAgentEvents((payload) => {
      if (payload.sessionId === sessionId) {
        get()._handleEvent(payload)
      }
    })

    set({
      sessionId,
      boundPlaybookId: options.playbookId ?? null,
      _unsubscribe: unsubscribe,
      isStreaming: false,
      activeTools: [],
      lastError: null,
    })

    return sessionId
  },

  sendPrompt: async (message: string) => {
    const { sessionId } = get()
    if (!sessionId) throw new Error("No active session")

    set({ isStreaming: true, lastError: null })
    try {
      await promptAgent(sessionId, message)
    } catch (error) {
      set({
        isStreaming: false,
        lastError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  abort: () => {
    const { sessionId } = get()
    if (sessionId) {
      abortAgentSession(sessionId)
    }
    set({ isStreaming: false, activeTools: [] })
  },

  destroy: async () => {
    const { sessionId, _unsubscribe } = get()
    _unsubscribe?.()
    if (sessionId) {
      await destroyAgentSession(sessionId).catch(() => {})
    }
    set(INITIAL_STATE)
  },

  _handleEvent: (payload: AgentEventPayload) => {
    const event = payload.event

    switch (event.type) {
      case "agent_start":
        set({ isStreaming: true, activeTools: [] })
        break

      case "agent_end":
        set({ isStreaming: false, activeTools: [] })
        break

      case "tool_execution_start":
        set((state) => ({
          activeTools: [
            ...state.activeTools,
            {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: "running" as const,
              args: event.args,
            },
          ],
        }))
        break

      case "tool_execution_end":
        set((state) => ({
          activeTools: state.activeTools.map((t) =>
            t.toolCallId === event.toolCallId
              ? { ...t, status: event.isError ? ("error" as const) : ("done" as const) }
              : t
          ),
        }))
        break
    }
  },

  reset: () => {
    const { _unsubscribe } = get()
    _unsubscribe?.()
    set(INITIAL_STATE)
  },
}))
