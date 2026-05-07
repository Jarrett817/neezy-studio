// Settings storage service using Drizzle ORM

import { getDb, schema } from "~/services/db"
import { eq } from "drizzle-orm"

export async function getSetting<T = string>(key: string): Promise<T | null> {
  const db = getDb()
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  if (!row) return null
  return JSON.parse(row.value) as T
}

export async function setSetting<T = string>(key: string, value: T): Promise<void> {
  const db = getDb()
  await db.insert(schema.settings).values({
    key,
    value: JSON.stringify(value),
    updated_at: Date.now(),
  }).onConflictDoUpdate({
    target: schema.settings.key,
    set: { value: JSON.stringify(value), updated_at: Date.now() },
  })
}