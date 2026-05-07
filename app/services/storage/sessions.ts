// Session storage service using Drizzle ORM

import { nanoid } from "nanoid"
import { getDb, schema } from "../db"
import { eq, desc } from "drizzle-orm"

export type Session = {
  id: string
  title: string
  created_at: number
  updated_at: number
  message_count: number
  last_message_preview: string | null
}

export async function createSession(title: string): Promise<Session> {
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

export async function listSessions(): Promise<Session[]> {
  const db = getDb()
  const result = await db
    .select()
    .from(schema.sessions)
    .orderBy(desc(schema.sessions.updated_at))
  return result
}

export async function updateSession(
  id: string,
  updates: Partial<Omit<Session, "id" | "created_at">>
): Promise<void> {
  const db = getDb()
  await db
    .update(schema.sessions)
    .set({ ...updates, updated_at: Date.now() })
    .where(eq(schema.sessions.id, id))
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb()
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id))
}
