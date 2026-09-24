const KV_ACTIVE_CHAT_SESSION_ID = "active_chat_session_id"

export async function getActiveChatSessionId(): Promise<string | null> {
  const id = localStorage.getItem(KV_ACTIVE_CHAT_SESSION_ID)?.trim()
  return id || null
}

export async function setActiveChatSessionId(sessionId: string): Promise<void> {
  localStorage.setItem(KV_ACTIVE_CHAT_SESSION_ID, sessionId)
}

export async function clearActiveChatSessionId(): Promise<void> {
  localStorage.removeItem(KV_ACTIVE_CHAT_SESSION_ID)
}
