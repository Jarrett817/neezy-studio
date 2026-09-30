import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import {
  getActiveSessionId,
  loadActivePiChatSession,
  loadPiChatMessages,
  setActiveSessionId as persistActiveSessionId,
  pruneEmptyPiChatSessions,
  reconcileActivePiSession,
} from "~/services/pi-chat-sessions"
import { clearActiveChatSessionId } from "~/services/storage/app-kv"
import { useAppStore } from "~/stores/app-store"

export function useChatSession() {
  const queryClient = useQueryClient()

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsReady, setSessionsReady] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  const setConversationHistory = useAppStore((s) => s.setConversationHistory)
  const clearConversation = useAppStore((s) => s.clearConversation)

  useEffect(() => {
    let cancelled = false
    setSessionsReady(false)
    ;(async () => {
      try {
        await reconcileActivePiSession()
        const keepId = await getActiveSessionId()
        await pruneEmptyPiChatSessions(keepId)

        const loaded = await loadActivePiChatSession()

        if (cancelled) return
        if (loaded.session) {
          sessionIdRef.current = loaded.session.id
          setActiveSessionId(loaded.session.id)
          await persistActiveSessionId(loaded.session.id)
          setConversationHistory(loaded.messages)
        } else {
          sessionIdRef.current = null
          setActiveSessionId(null)
          await clearActiveChatSessionId().catch(() => {})
          clearConversation()
        }
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      } catch (err) {
        console.warn("[chat] load sessions failed:", err)
      } finally {
        if (!cancelled) setSessionsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setConversationHistory, queryClient.invalidateQueries, clearConversation])

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === sessionIdRef.current) return
    sessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
    await persistActiveSessionId(sessionId)
    const loaded = await loadPiChatMessages(sessionId)
    setConversationHistory(loaded)
    queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    return { reset: true }
  }

  const handleNewSession = async (sessionId: string) => {
    sessionIdRef.current = sessionId
    flushSync(() => setActiveSessionId(sessionId))
    await persistActiveSessionId(sessionId)
    clearConversation()
    queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
    return { reset: true }
  }

  return {
    activeSessionId,
    setActiveSessionId,
    sessionsReady,
    sessionIdRef,
    handleSelectSession,
    handleNewSession,
  }
}
