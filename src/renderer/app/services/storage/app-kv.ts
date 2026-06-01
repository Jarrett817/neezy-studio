import { eq } from "drizzle-orm"

import { ensureDbReady, getDb, schema } from "../db"

const KV_ACTIVE_CHAT_SESSION_ID = "active_chat_session_id"
const KV_USER_PORTRAIT_V1 = "user_portrait_v1"

export type StoredUserPortrait = {
  summary: string
  dimensions: Array<{
    id: string
    label: string
    score: number
    description: string
    evidence: string[]
  }>
  topics: Array<{ label: string; weight: number }>
  signals: Array<{ text: string; at: number }>
  conversationTurns: number
  lastUpdatedAt: number
}

async function getKv(key: string): Promise<string | null> {
  await ensureDbReady()
  const rows = await getDb()
    .select({ value: schema.appKv.value })
    .from(schema.appKv)
    .where(eq(schema.appKv.key, key))
  return rows[0]?.value ?? null
}

async function setKv(key: string, value: string): Promise<void> {
  await ensureDbReady()
  await getDb()
    .insert(schema.appKv)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appKv.key,
      set: { value },
    })
}

export async function getActiveChatSessionId(): Promise<string | null> {
  const id = (await getKv(KV_ACTIVE_CHAT_SESSION_ID))?.trim()
  return id || null
}

export async function setActiveChatSessionId(sessionId: string): Promise<void> {
  await setKv(KV_ACTIVE_CHAT_SESSION_ID, sessionId)
}

export async function clearActiveChatSessionId(): Promise<void> {
  await setKv(KV_ACTIVE_CHAT_SESSION_ID, "")
}

export async function getUserPortraitFromDb(): Promise<StoredUserPortrait | null> {
  const raw = await getKv(KV_USER_PORTRAIT_V1)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredUserPortrait
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

export async function saveUserPortraitToDb(
  portrait: StoredUserPortrait
): Promise<void> {
  await setKv(KV_USER_PORTRAIT_V1, JSON.stringify(portrait))
}
