import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { AgentStep } from "~/lib/agent-steps"

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
  agentSteps?: AgentStep[]
  isStreaming?: boolean
  toolCalls?: { name: string; args: Record<string, unknown>; result: string }[]
  timestamp: number
}

type AppStoreState = {
  // 对话历史（跨页面保活）
  conversationHistory: ChatMessage[]
  addMessage: (msg: Omit<ChatMessage, "timestamp">) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  clearConversation: () => void
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
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
      clearConversation: () => set({ conversationHistory: [] }),
    }),
    {
      name: "neezy-app-store",
      partialize: (state) => ({
        conversationHistory: state.conversationHistory,
      }),
    }
  )
)
