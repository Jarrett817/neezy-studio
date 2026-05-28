import { getSetting, setSetting } from "~/services/storage/settings-store"
import type { ChatMessage } from "~/stores/app-store"

import { deleteChatMessagesForSession, listChatMessages } from "./chat-messages"
import {
  createSession,
  deleteSession,
  listSessions,
  type Session,
} from "./sessions"

const ACTIVE_SESSION_KEY = "chat_active_session_id"

export async function getActiveSessionId(): Promise<string | null> {
  return getSetting<string>(ACTIVE_SESSION_KEY)
}

export async function setActiveSessionId(sessionId: string): Promise<void> {
  await setSetting(ACTIVE_SESSION_KEY, sessionId)
}

export async function listChatSessions(): Promise<Session[]> {
  return listSessions()
}

export async function loadChatSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return listChatMessages(sessionId)
}

export async function ensureActiveChatSession(): Promise<Session> {
  const activeId = await getActiveSessionId()
  const sessions = await listSessions()
  if (activeId) {
    const found = sessions.find((s) => s.id === activeId)
    if (found) return found
  }
  if (sessions[0]) {
    await setActiveSessionId(sessions[0].id)
    return sessions[0]
  }
  const created = await createSession("新对话")
  await setActiveSessionId(created.id)
  return created
}

export async function startNewChatSession(title = "新对话"): Promise<Session> {
  const session = await createSession(title)
  await setActiveSessionId(session.id)
  return session
}

export async function removeChatSession(sessionId: string): Promise<void> {
  const activeId = await getActiveSessionId()
  const wasActive = activeId === sessionId
  await deleteChatMessagesForSession(sessionId)
  await deleteSession(sessionId)
  if (wasActive) {
    const remaining = await listSessions()
    if (remaining[0]) {
      await setActiveSessionId(remaining[0].id)
    } else {
      const created = await createSession("新对话")
      await setActiveSessionId(created.id)
    }
  }
}
