import {
  sessionListPreview,
  sessionListTitle,
  type SessionInfoDto,
} from "../../../shared/pi-session-dto"
import type { ChatMessage } from "~/stores/app-store"
import { getElectronApi } from "./electron-client"
import {
  clearActiveChatSessionId,
  getActiveChatSessionId,
  getChatSessionPlaybookId,
  setActiveChatSessionId,
  setChatSessionPlaybookId,
  clearChatSessionPlaybookId,
} from "./storage/app-kv"

export type { SessionInfoDto }

export async function getPiSessionsDir(): Promise<string> {
  return getElectronApi().invoke<string>("pi-sessions:get-dir")
}

export async function listPiChatSessions(): Promise<SessionInfoDto[]> {
  return getElectronApi().invoke("pi-sessions:list")
}

export async function listPiChatSessionsWithMessages(): Promise<SessionInfoDto[]> {
  return getElectronApi().invoke("pi-sessions:list-with-messages")
}

export async function createPiChatSessionRecord(): Promise<SessionInfoDto> {
  return getElectronApi().invoke("pi-sessions:create")
}

export async function loadPiChatMessages(sessionId: string): Promise<ChatMessage[]> {
  return getElectronApi().invoke("pi-sessions:load-messages", sessionId)
}

export async function deletePiChatSession(sessionId: string): Promise<void> {
  await getElectronApi().invoke("pi-sessions:delete", sessionId)
}

export async function pruneEmptyPiChatSessions(
  keepSessionId?: string | null
): Promise<number> {
  return getElectronApi().invoke("pi-sessions:prune-empty", keepSessionId ?? null)
}

export async function getActiveSessionId(): Promise<string | null> {
  return getActiveChatSessionId()
}

/** 活跃 id 不在 pi-sessions 磁盘列表时清空（迁移 / prune 后的陈旧 kv） */
export async function reconcileActivePiSession(): Promise<string | null> {
  const activeId = await getActiveSessionId()
  if (!activeId) return null
  const sessions = await listPiChatSessions()
  if (sessions.some((s) => s.id === activeId)) return activeId
  await clearActiveChatSessionId()
  return null
}

export async function isPiSessionOnDisk(sessionId: string): Promise<boolean> {
  const sessions = await listPiChatSessions()
  return sessions.some((s) => s.id === sessionId)
}

export async function setActiveSessionId(sessionId: string): Promise<void> {
  await setActiveChatSessionId(sessionId)
}

export { sessionListTitle, sessionListPreview }

export async function loadActivePiChatSession(): Promise<{
  session: SessionInfoDto | null
  messages: ChatMessage[]
}> {
  const sessions = await listPiChatSessions()
  const activeId = await getActiveSessionId()
  const active = activeId ? sessions.find((s) => s.id === activeId) : undefined

  if (active) {
    const messages = await loadPiChatMessages(active.id)
    if (messages.length > 0) {
      return { session: active, messages }
    }
  }

  for (const session of sessions) {
    if (session.messageCount === 0) continue
    const messages = await loadPiChatMessages(session.id)
    if (messages.length > 0) {
      await setActiveSessionId(session.id)
      return { session, messages }
    }
  }

  return { session: null, messages: [] }
}

export async function loadPiChatSessionById(sessionId: string): Promise<{
  session: SessionInfoDto | null
  messages: ChatMessage[]
}> {
  const sessions = await listPiChatSessions()
  const found = sessions.find((s) => s.id === sessionId)
  if (!found) return { session: null, messages: [] }
  const messages = await loadPiChatMessages(sessionId)
  if (messages.length > 0) {
    await setActiveSessionId(sessionId)
  }
  return { session: found, messages }
}

export async function ensurePiChatSessionForSend(): Promise<SessionInfoDto> {
  await reconcileActivePiSession()
  const activeId = await getActiveSessionId()
  const sessions = await listPiChatSessions()
  if (activeId) {
    const found = sessions.find((s) => s.id === activeId)
    if (found) return found
  }
  if (sessions[0]) {
    await setActiveSessionId(sessions[0].id)
    return sessions[0]
  }
  return startNewPiChatSession()
}

export async function startNewPiChatSession(): Promise<SessionInfoDto> {
  const session = await createPiChatSessionRecord()
  await setActiveSessionId(session.id)
  await clearChatSessionPlaybookId(session.id)
  await pruneEmptyPiChatSessions(session.id)
  return session
}

export async function getChatSessionPlaybook(
  sessionId: string
): Promise<string | null> {
  return getChatSessionPlaybookId(sessionId)
}

/**
 * 查找绑定了指定 playbook 且有消息的最近 session。
 * 用于场景入口优先复用已有 session 而非每次新建。
 */
export async function findRecentSessionForPlaybook(
  playbookId: string
): Promise<SessionInfoDto | null> {
  const sessions = await listPiChatSessionsWithMessages()
  for (const session of sessions) {
    const bound = await getChatSessionPlaybookId(session.id)
    if (bound === playbookId) return session
  }
  return null
}

export async function bindChatSessionPlaybook(
  sessionId: string,
  playbookId: string
): Promise<void> {
  await setChatSessionPlaybookId(sessionId, playbookId)
}

export async function clearChatSessionPlaybook(sessionId: string): Promise<void> {
  await clearChatSessionPlaybookId(sessionId)
}

export async function ensureActivePiChatSession(): Promise<SessionInfoDto> {
  const activeId = await getActiveSessionId()
  const sessions = await listPiChatSessions()
  if (activeId) {
    const found = sessions.find((s) => s.id === activeId)
    if (found) return found
  }
  if (sessions[0]) {
    await setActiveSessionId(sessions[0].id)
    return sessions[0]
  }
  return startNewPiChatSession()
}

export async function removePiChatSession(sessionId: string): Promise<void> {
  const activeId = await getActiveSessionId()
  const wasActive = activeId === sessionId
  await deletePiChatSession(sessionId)
  if (!wasActive) return
  const remaining = await listPiChatSessions()
  if (remaining[0]) {
    await setActiveSessionId(remaining[0].id)
    return
  }
  await startNewPiChatSession()
}
