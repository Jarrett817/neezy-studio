// Session storage service using Drizzle ORM

import { nanoid } from "nanoid"
import { eq } from "drizzle-orm"

import { ensureDbReady, ensureInit, getDb, schema } from "../db"
import { selectSqliteRows } from "./sqlite-rows"

export type Session = {
  id: string
  title: string
  created_at: number
  updated_at: number
  message_count: number
  last_message_preview: string | null
}

function normalizeSessionRow(
  row: typeof schema.sessions.$inferSelect
): Session {
  return {
    id: row.id,
    title: row.title,
    created_at: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0,
    message_count: Number(row.message_count) || 0,
    last_message_preview: row.last_message_preview,
  }
}

export async function createSession(title: string): Promise<Session> {
  await ensureDbReady()
  const db = getDb()
  const id = nanoid(21)
  const now = Date.now()

  await db.insert(schema.sessions).values({
    id,
    title,
    created_at: now,
    updated_at: now,
    message_count: 0,
    last_message_preview: null,
  })

  return {
    id,
    title,
    created_at: now,
    updated_at: now,
    message_count: 0,
    last_message_preview: null,
  }
}

type SessionRow = {
  id: string
  title: string
  created_at: number
  updated_at: number
  message_count: number
  last_message_preview: string | null
}

export async function listSessions(): Promise<Session[]> {
  const rows = await selectSqliteRows<SessionRow>(
    `SELECT id, title, created_at, updated_at, message_count, last_message_preview
     FROM sessions
     ORDER BY updated_at DESC`
  )
  return rows.map((row) =>
    normalizeSessionRow(row as typeof schema.sessions.$inferSelect)
  )
}

export async function updateSession(
  id: string,
  updates: Partial<Omit<Session, "id" | "created_at">>
): Promise<void> {
  await ensureInit()
  const db = getDb()
  await db
    .update(schema.sessions)
    .set({ ...updates, updated_at: Date.now() })
    .where(eq(schema.sessions.id, id))
}

export async function deleteSession(id: string): Promise<void> {
  await ensureInit()
  const db = getDb()
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id))
}
