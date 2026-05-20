// Settings storage service using Drizzle ORM

import { ensureInit, getDb, schema } from "~/services/db"
import { eq } from "drizzle-orm"

function parseJsonValue<T>(raw: unknown, key: string): T | null {
  if (raw == null) return null
  if (typeof raw !== "string") {
    console.warn(`[settings] "${key}" value is not a string, ignoring`)
    return null
  }
  const text = raw.trim()
  if (!text || text === "undefined") return null
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.warn(`[settings] invalid JSON for "${key}", ignoring:`, error)
    return null
  }
}

export async function getSetting<T = string>(key: string): Promise<T | null> {
  await ensureInit()
  const db = getDb()
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get()
  if (!row) return null
  return parseJsonValue<T>(row.value, key)
}

export async function setSetting<T = string>(
  key: string,
  value: T
): Promise<void> {
  const serialized = value === undefined ? "null" : JSON.stringify(value)
  if (typeof serialized !== "string") {
    throw new Error(`Cannot serialize setting "${key}"`)
  }

  try {
    await ensureInit()
    const db = getDb()
    await db
      .insert(schema.settings)
      .values({
        key,
        value: serialized,
        updated_at: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: serialized, updated_at: Date.now() },
      })
  } catch (e) {
    console.error(`[settings] Failed to set ${key}:`, e)
    throw e
  }
}
