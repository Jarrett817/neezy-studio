import { useState, useRef, useEffect, useCallback } from "react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate, useSearchParams } from "react-router"

import { useAppStore } from "~/stores/app-store"
import {
  bindChatSessionPlaybook,
  getActiveSessionId,
  getChatSessionPlaybook,
  loadActivePiChatSession,
  loadPiChatSessionById,
  loadPiChatMessages,
  pruneEmptyPiChatSessions,
  reconcileActivePiSession,
  setActiveSessionId as persistActiveSessionId,
  startNewPiChatSession,
} from "~/services/pi-chat-sessions"
import { clearActiveChatSessionId } from "~/services/storage/app-kv"

type SceneLaunchState = { sceneLaunch?: boolean }

export function useChatSession() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionFromUrl = searchParams.get("session")?.trim() || null
  const playbookIdFromUrl = searchParams.get("playbook")?.trim() || null
  const sceneLaunch =
    (location.state as SceneLaunchState | null)?.sceneLaunch === true
  const sceneLaunchRef = useRef(false)
  sceneLaunchRef.current = sceneLaunch

  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(playbookIdFromUrl)
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
    if (playbookIdFromUrl) setActivePlaybookId(playbookIdFromUrl)
  }, [playbookIdFromUrl])

  const bootFreshSceneSession = useCallback(
    async (playbookId: string) => {
      const fresh = await startNewPiChatSession()
      await bindChatSessionPlaybook(fresh.id, playbookId)
      sessionIdRef.current = fresh.id
      setActiveSessionId(fresh.id)
      setActivePlaybookId(playbookId)
      await persistActiveSessionId(fresh.id)
      clearConversation()
      syncPlaybookInUrl(playbookId, null)
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
      queryClient.invalidateQueries({ queryKey: ["chat-sessions", "with-messages"] })
      return fresh.id
    },
    [clearConversation, queryClient, syncPlaybookInUrl]
  )

  useEffect(() => {
    let cancelled = false
    setSessionsReady(false)
    const forceSceneLaunch = sceneLaunchRef.current
    if (playbookIdFromUrl && (!sessionFromUrl || forceSceneLaunch)) {
      clearConversation()
    }

    ;(async () => {
      try {
        await reconcileActivePiSession()
        const keepId = sessionFromUrl ?? (await getActiveSessionId())
        await pruneEmptyPiChatSessions(keepId)

        // 场景入口：无 session 参数，或显式 sceneLaunch → 始终新建对话
        if (playbookIdFromUrl && (!sessionFromUrl || forceSceneLaunch)) {
          await bootFreshSceneSession(playbookIdFromUrl)
          if (!cancelled && forceSceneLaunch) {
            navigate(
              {
                pathname: "/chat",
                search: `?playbook=${encodeURIComponent(playbookIdFromUrl)}`,
              },
              { replace: true, state: null }
            )
          }
          return
        }

        if (playbookIdFromUrl && sessionFromUrl) {
          const boundPlaybook = await getChatSessionPlaybook(sessionFromUrl)
          if (boundPlaybook && boundPlaybook !== playbookIdFromUrl) {
            await bootFreshSceneSession(playbookIdFromUrl)
            return
          }
        }

        const loaded = sessionFromUrl
          ? await loadPiChatSessionById(sessionFromUrl)
          : await loadActivePiChatSession()

        if (cancelled) return
        if (loaded.session && loaded.messages.length > 0) {
          sessionIdRef.current = loaded.session.id
          setActiveSessionId(loaded.session.id)
          await persistActiveSessionId(loaded.session.id)
          const boundPlaybook = await getChatSessionPlaybook(loaded.session.id)
          const sceneId = playbookIdFromUrl ?? boundPlaybook
          if (sceneId) {
            setActivePlaybookId(sceneId)
            if (!playbookIdFromUrl) syncPlaybookInUrl(sceneId, loaded.session.id)
          }
          setConversationHistory(loaded.messages)
        } else if (playbookIdFromUrl) {
          await bootFreshSceneSession(playbookIdFromUrl)
        } else {
          sessionIdRef.current = null
          setActiveSessionId(null)
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
  }, [
    sessionFromUrl,
    playbookIdFromUrl,
    bootFreshSceneSession,
    clearConversation,
    navigate,
    queryClient,
    setConversationHistory,
    syncPlaybookInUrl,
  ])

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current) return
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      await persistActiveSessionId(sessionId)
      const loaded = await loadPiChatMessages(sessionId)
      const boundPlaybook = await getChatSessionPlaybook(sessionId)
      if (boundPlaybook) {
        setActivePlaybookId(boundPlaybook)
        syncPlaybookInUrl(boundPlaybook, sessionId)
      } else {
        setActivePlaybookId(null)
        syncPlaybookInUrl(null, sessionId)
      }
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
      await pruneEmptyPiChatSessions(sessionId)
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