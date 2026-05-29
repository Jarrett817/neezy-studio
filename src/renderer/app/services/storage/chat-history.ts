import {
  getActiveChatSessionId,
  setActiveChatSessionId as persistActiveChatSessionId,
} from "~/services/storage/app-kv"
import type { ChatMessage } from "~/stores/app-store"

import {
  countChatMessages,
  deleteChatMessagesForSession,
  listChatMessages,
} from "./chat-messages"
import {
  createSession,
  deleteSession,
  listSessions,
  updateSession,
  type Session,
} from "./sessions"

let ensureSessionLock: Promise<Session> | null = null

export async function getActiveSessionId(): Promise<string | null> {
  return getActiveChatSessionId()
}

/** 删除无消息的空会话（保留当前活跃 id，按 chat_messages 实际条数判断） */
export async function pruneEmptyChatSessions(
  keepSessionId?: string | null
): Promise<number> {
  const keepId = keepSessionId ?? (await getActiveSessionId())
  const sessions = await listSessions()
  let removed = 0
  for (const session of sessions) {
    if (keepId && session.id === keepId) continue
    const count = await countChatMessages(session.id)
    if (count > 0) {
      if (session.message_count !== count) {
        await updateSession(session.id, { message_count: count })
      }
      continue
    }
    await deleteChatMessagesForSession(session.id)
    await deleteSession(session.id)
    removed += 1
  }
  return removed
}

async function loadSessionWithMessages(
  session: Session
): Promise<{ session: Session; messages: ChatMessage[] }> {
  const messages = await listChatMessages(session.id)
  if (messages.length > 0 && session.message_count !== messages.length) {
    await updateSession(session.id, { message_count: messages.length })
  }
  return { session, messages }
}

/** 进入对话页：优先活跃会话；无消息则回退到最近有内容的会话 */
export async function loadActiveChatSession(): Promise<{
  session: Session | null
  messages: ChatMessage[]
}> {
  const sessions = await listSessions()
  const activeId = await getActiveSessionId()
  const active = activeId ? sessions.find((s) => s.id === activeId) : undefined

  if (active) {
    const loaded = await loadSessionWithMessages(active)
    if (loaded.messages.length > 0) {
      return loaded
    }
  }

  for (const session of sessions) {
    const loaded = await loadSessionWithMessages(session)
    if (loaded.messages.length > 0) {
      await setActiveSessionId(session.id)
      return loaded
    }
  }

  return { session: null, messages: [] }
}

/** 按 id 加载会话（工作台跳转用） */
export async function loadChatSessionById(sessionId: string): Promise<{
  session: Session | null
  messages: ChatMessage[]
}> {
  const sessions = await listSessions()
  const found = sessions.find((s) => s.id === sessionId)
  if (!found) return { session: null, messages: [] }
  const loaded = await loadSessionWithMessages(found)
  if (loaded.messages.length > 0) {
    await setActiveSessionId(found.id)
  }
  return loaded
}

/** 发送首条消息前确保存在会话 */
export async function ensureChatSessionForSend(): Promise<Session> {
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
  return startNewChatSession()
}

export async function setActiveSessionId(sessionId: string): Promise<void> {
  await persistActiveChatSessionId(sessionId)
}

export async function listChatSessions(): Promise<Session[]> {
  return listSessions()
}

/** 仅含至少一条消息的会话（工作台统计 / 最近列表） */
export async function listChatSessionsWithMessages(): Promise<Session[]> {
  const sessions = await listSessions()
  const withMessages: Session[] = []
  for (const session of sessions) {
    const count = await countChatMessages(session.id)
    if (count === 0) continue
    if (session.message_count !== count) {
      await updateSession(session.id, { message_count: count })
      withMessages.push({ ...session, message_count: count })
    } else {
      withMessages.push(session)
    }
  }
  return withMessages
}

export async function loadChatSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return listChatMessages(sessionId)
}

export async function ensureActiveChatSession(): Promise<Session> {
  if (ensureSessionLock) return ensureSessionLock
  ensureSessionLock = (async () => {
    try {
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
    } finally {
      ensureSessionLock = null
    }
  })()
  return ensureSessionLock
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
