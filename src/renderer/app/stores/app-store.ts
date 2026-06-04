import type { JSONContent } from "@tiptap/react"
import { create } from "zustand"

import type { AgentStep, ChatToolCall } from "~/lib/agent-steps"

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  /** 纯文本：用于 LLM 上下文与向后兼容。 */
  content: string
  /** Tiptap JSON 文档：可选，存在时使用 TiptapContent 渲染。 */
  contentJson?: JSONContent
  thinking: string
  agentSteps?: AgentStep[]
  isStreaming?: boolean
  failed?: boolean
  toolCalls?: ChatToolCall[]
  usageSummary?: string
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
