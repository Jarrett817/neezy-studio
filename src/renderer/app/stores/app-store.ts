import { create } from "zustand"

import type { AgentStep } from "~/lib/agent-steps"

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
  agentSteps?: AgentStep[]
  isStreaming?: boolean
  failed?: boolean
  toolCalls?: { name: string; args: Record<string, unknown>; result: string }[]
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
