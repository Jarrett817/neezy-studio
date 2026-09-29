import type { JSONContent } from "@tiptap/react"
import { create } from "zustand"

import type {
  AgentStep,
  AssistantActivityItem,
  ChatToolCall,
} from "~/lib/agent-steps"

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  /** 纯文本：用于 LLM 上下文与向后兼容。 */
  content: string
  /** Tiptap JSON 文档：可选，存在时使用 TiptapContent 渲染。 */
  contentJson?: JSONContent
  thinking: string
  /** 按 Pi 消息块顺序：思考 / 正文 / 工具 */
  activity?: AssistantActivityItem[]
  agentSteps?: AgentStep[]
  isStreaming?: boolean
  failed?: boolean
  /** 失败原因；有正文时不覆盖 content，单独展示 */
  errorMessage?: string
  toolCalls?: ChatToolCall[]
  usageSummary?: string
  /** 已发送但 Agent 尚未开始处理（sessionLock 排队） */
  queued?: boolean
  timestamp: number
}

type AppStoreState = {
  conversationHistory: ChatMessage[]
  addMessage: (msg: Omit<ChatMessage, "timestamp">) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  setConversationHistory: (messages: ChatMessage[]) => void
  clearConversation: () => void
}

export const useAppStore = create<AppStoreState>()((set) => ({
  conversationHistory: [],
  addMessage: (msg) =>
    set((state) => ({
      conversationHistory: [
        ...state.conversationHistory,
        { ...msg, timestamp: Date.now() },
      ],
    })),
  updateMessage: (id, updates) =>
    set((state) => ({
      conversationHistory: state.conversationHistory.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  setConversationHistory: (messages) => set({ conversationHistory: messages }),
  clearConversation: () => set({ conversationHistory: [] }),
}))
