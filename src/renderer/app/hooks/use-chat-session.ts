import { useState, useRef, useEffect, useCallback } from "react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"

import { useAppStore } from "~/stores/app-store"
import {
  getActiveSessionId,
  getChatSessionPlaybook,
  loadActivePiChatSession,
  loadPiChatSessionById,
  loadPiChatMessages,
  pruneEmptyPiChatSessions,
  reconcileActivePiSession,
  setActiveSessionId as persistActiveSessionId,
} from "~/services/pi-chat-sessions"
import { clearActiveChatSessionId } from "~/services/storage/app-kv"

export function useChatSession() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionFromUrl = searchParams.get("session")?.trim() || null

  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsReady, setSessionsReady] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  const setConversationHistory = useAppStore((s) => s.setConversationHistory)
  const clearConversation = useAppStore((s) => s.clearConversation)

  const syncPlaybookInUrl = useCallback(
    (playbookId: string | null, sessionId?: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (sessionId) next.set("session", sessionId)
        else next.delete("session")
        if (playbookId) next.set("playbook", playbookId)
        else next.delete("playbook")
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  useEffect(() => {
    let cancelled = false
    setSessionsReady(false)
    ;(async () => {
      try {
        await reconcileActivePiSession()
        const keepId = sessionFromUrl ?? (await getActiveSessionId())
        await pruneEmptyPiChatSessions(keepId)

        const loaded = sessionFromUrl
          ? await loadPiChatSessionById(sessionFromUrl)
          : await loadActivePiChatSession()

        if (cancelled) return
        if (loaded.session) {
          sessionIdRef.current = loaded.session.id
          setActiveSessionId(loaded.session.id)
          await persistActiveSessionId(loaded.session.id)
          const boundPlaybook = await getChatSessionPlaybook(loaded.session.id)
          setActivePlaybookId(boundPlaybook)
          setConversationHistory(loaded.messages)
        } else {
          sessionIdRef.current = null
          setActiveSessionId(null)
          setActivePlaybookId(null)
          await clearActiveChatSessionId().catch(() => {})
          clearConversation()
        }
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
        queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
        queryClient.invalidateQueries({ queryKey: ["chat-sessions", "with-messages"] })
      } catch (err) {
        console.warn("[chat] load sessions failed:", err)
      } finally {
        if (!cancelled) setSessionsReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [sessionFromUrl])

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current) return
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      await persistActiveSessionId(sessionId)
      const loaded = await loadPiChatMessages(sessionId)
      const boundPlaybook = await getChatSessionPlaybook(sessionId)
      setActivePlaybookId(boundPlaybook)
      syncPlaybookInUrl(boundPlaybook, sessionId)
      setConversationHistory(loaded)
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      return { reset: true }
    },
    [setConversationHistory, queryClient, syncPlaybookInUrl]
  )

  const handleNewSession = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId
      flushSync(() => setActiveSessionId(sessionId))
      await persistActiveSessionId(sessionId)
      clearConversation()
      setActivePlaybookId(null)
      syncPlaybookInUrl(null, sessionId)
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      return { reset: true }
    },
    [clearConversation, queryClient, syncPlaybookInUrl]
  )

  return {
    activeSessionId,
    setActiveSessionId,
    activePlaybookId,
    sessionsReady,
    sessionIdRef,
    setActivePlaybookId,
    handleSelectSession,
    handleNewSession,
    syncPlaybookInUrl,
    queryClient,
  }
}