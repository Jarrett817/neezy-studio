import fsSync from "node:fs"
import path from "node:path"
import { createClient, type Client, type InArgs } from "@libsql/client"

import * as libsqlVector from "./libsql-vector"

type DbEntry = {
  client: Client
}

const handles = new Map<string, DbEntry>()

function resolveDbPath(input: string): string {
  return input.startsWith("sqlite:") ? input.slice("sqlite:".length) : input
}

function toLibsqlUrl(dbPath: string): string {
  const resolved = resolveDbPath(dbPath)
  if (resolved.startsWith("file:")) return resolved
  return `file:${resolved.replace(/\\/g, "/")}`
}

function bindArgs(params: unknown[]): InArgs {
  return params.map((value) => (value === undefined ? null : value)) as InArgs
}

function openEntry(resolved: string): DbEntry {
  fsSync.mkdirSync(path.dirname(resolved), { recursive: true })
  const client = createClient({ url: toLibsqlUrl(resolved) })
  const entry: DbEntry = { client }
  handles.set(resolved, entry)
  return entry
}

export function openDatabase(dbPath: string): Client {
  return getEntry(dbPath).client
}

export function getEntry(dbPath: string): DbEntry {
  const resolved = resolveDbPath(dbPath)
  const existing = handles.get(resolved)
  if (existing) return existing
  return openEntry(resolved)
}

export function closeAll(): void {
  for (const { client } of handles.values()) client.close()
  handles.clear()
}

export function getVecStatus(_dbPath: string) {
  return {
    available: true,
    path: "libsql/F32_BLOB",
    error: null,
  }
}

export async function ensureVectorSchema(dbPath: string) {
  const { client } = getEntry(dbPath)
  await libsqlVector.ensureTables(client)
  return { mode: "libsql" as const }
}

export async function runStatement(
  dbPath: string,
  sql: string,
  params: unknown[] = []
) {
  const { client } = getEntry(dbPath)
  const result = await client.execute({ sql, args: bindArgs(params) })
  return {
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    changes: Number(result.rowsAffected ?? 0),
  }
}

export async function selectStatement(
  dbPath: string,
  sql: string,
  params: unknown[] = []
) {
  const { client } = getEntry(dbPath)
  const result = await client.execute({ sql, args: bindArgs(params) })
  return result.rows as Record<string, unknown>[]
}

export { libsqlVector }

