import { asc, eq } from "drizzle-orm"

import type { ChatMessage } from "~/stores/app-store"
import { ensureInit, getDb, schema } from "../db"

import { updateSession, type Session } from "./sessions"
import { selectSqliteRows } from "./sqlite-rows"

type StoredToolCall = {
  name: string
  args: Record<string, unknown>
  result: string
}

type ChatMessageRow = {
  id: string
  session_id: string
  role: string
  content: string
  thinking: string | null
  tool_calls_json: string | null
  created_at: number
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  let toolCalls: StoredToolCall[] | undefined
  if (row.tool_calls_json) {
    try {
      const parsed = JSON.parse(row.tool_calls_json) as StoredToolCall[]
      if (Array.isArray(parsed) && parsed.length > 0) toolCalls = parsed
    } catch {
      toolCalls = undefined
    }
  }
  return {
    id: row.id,
    role: row.role as ChatMessage["role"],
    content: row.content ?? "",
    thinking: row.thinking ?? "",
    toolCalls,
    timestamp: Number(row.created_at) || 0,
  }
}

export async function countChatMessages(sessionId: string): Promise<number> {
  const rows = await selectSqliteRows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?`,
    [sessionId]
  )
  return Number(rows[0]?.n ?? 0)
}

export async function listChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const rows = await selectSqliteRows<ChatMessageRow>(
    `SELECT id, session_id, role, content, thinking, tool_calls_json, created_at
     FROM chat_messages
     WHERE session_id = ?
     ORDER BY created_at ASC`,
    [sessionId]
  )
  return rows.map(rowToMessage)
}

export async function upsertChatMessage(
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  await ensureInit()
  const db = getDb()
  const createdAt = message.timestamp ?? Date.now()
  const toolCallsJson =
    message.toolCalls && message.toolCalls.length > 0
      ? JSON.stringify(message.toolCalls)
      : null

  await db
    .insert(schema.chatMessages)
    .values({
      id: message.id,
      session_id: sessionId,
      role: message.role,
      content: message.content,
      thinking: message.thinking ?? "",
      tool_calls_json: toolCallsJson,
      created_at: createdAt,
    })
    .onConflictDoUpdate({
      target: schema.chatMessages.id,
      set: {
        role: message.role,
        content: message.content,
        thinking: message.thinking ?? "",
        tool_calls_json: toolCallsJson,
      },
    })

  const preview =
    message.role === "user"
      ? message.content.slice(0, 80)
      : message.content.slice(0, 80) || null

  const sessionPatch: Partial<Omit<Session, "id" | "created_at">> = {
    last_message_preview: preview ?? undefined,
    updated_at: Date.now(),
  }

  const rows = await db
    .select({ id: schema.chatMessages.id, role: schema.chatMessages.role })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.session_id, sessionId))

  sessionPatch.message_count = rows.length

  const userMessages = rows.filter((r) => r.role === "user")
  if (message.role === "user" && userMessages.length === 1) {
    const trimmed = message.content.trim()
    const title = trimmed.slice(0, 32) || "新对话"
    sessionPatch.title = trimmed.length > 32 ? `${title}…` : title
  }

  await updateSession(sessionId, sessionPatch)
}

export async function deleteChatMessagesForSession(sessionId: string): Promise<void> {
  await ensureInit()
  const db = getDb()
  await db
    .delete(schema.chatMessages)
    .where(eq(schema.chatMessages.session_id, sessionId))
}
