import fsSync from "node:fs"
import path from "node:path"
import * as sqliteVec from "sqlite-vec"

import * as vectorFallback from "./vector-fallback"

type DatabaseSync = {
  loadExtension: (extPath: string) => void
  prepare: (sql: string) => {
    run: (...params: unknown[]) => { lastInsertRowid?: bigint | number; changes?: number }
    all: (...params: unknown[]) => unknown[]
    get: () => unknown
  }
  exec: (sql: string) => void
  close: () => void
}

let DatabaseSyncCtor: new (
  path: string,
  options?: { allowExtension?: boolean }
) => DatabaseSync

try {
  ;({ DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as {
    DatabaseSync: typeof DatabaseSyncCtor
  })
} catch (error) {
  throw new Error(
    `当前 Electron 未提供 node:sqlite（${error instanceof Error ? error.message : error}）。请使用 Electron 42+。`,
    { cause: error }
  )
}

const handles = new Map<
  string,
  { db: DatabaseSync; vecLoaded: boolean; vecPath: string | null }
>()
let lastVecError: string | null = null

export class VecUnavailableError extends Error {
  code = "VEC_UNAVAILABLE"

  constructor(message: string) {
    super(message)
    this.name = "VecUnavailableError"
  }
}

function resolveDbPath(input: string): string {
  return input.startsWith("sqlite:") ? input.slice("sqlite:".length) : input
}

function usesVecSql(sql: string): boolean {
  return /\bvec0\b/i.test(sql) || /\bvec_[a-z]/i.test(sql) || /\bembedding\s+MATCH\b/i.test(sql)
}

function toVecBinding(value: unknown): unknown {
  if (
    !Array.isArray(value) ||
    value.length < 16 ||
    typeof value[0] !== "number" ||
    !Number.isFinite(value[0])
  ) {
    return value
  }
  return new Uint8Array(new Float32Array(value as number[]).buffer)
}

function loadVecExtension(db: DatabaseSync): string {
  if (typeof db.loadExtension !== "function") {
    throw new Error("DatabaseSync.loadExtension 不可用")
  }
  const extPath = sqliteVec.getLoadablePath()
  db.loadExtension(extPath)
  db.prepare("SELECT vec_version() AS v").get()
  return extPath
}

export function openDatabase(dbPath: string): DatabaseSync {
  const resolved = resolveDbPath(dbPath)
  if (!handles.has(resolved)) {
    fsSync.mkdirSync(path.dirname(resolved), { recursive: true })
    const db = new DatabaseSyncCtor(resolved, { allowExtension: true })
    let vecLoaded = false
    let vecPath: string | null = null
    try {
      vecPath = loadVecExtension(db)
      vecLoaded = true
      lastVecError = null
      console.log("[sqlite] sqlite-vec 已加载:", vecPath)
    } catch (error) {
      lastVecError = error instanceof Error ? error.message : String(error)
      console.error("[sqlite] sqlite-vec 加载失败:", lastVecError)
      vectorFallback.ensureFallbackTables(db)
    }
    handles.set(resolved, { db, vecLoaded, vecPath })
  }
  return handles.get(resolved)!.db
}

export function getEntry(dbPath: string) {
  const resolved = resolveDbPath(dbPath)
  if (!handles.has(resolved)) {
    openDatabase(dbPath)
  }
  const entry = handles.get(resolved)!
  if (!entry.vecLoaded) {
    try {
      entry.vecPath = loadVecExtension(entry.db)
      entry.vecLoaded = true
      lastVecError = null
      console.log("[sqlite] sqlite-vec 重试加载成功:", entry.vecPath)
    } catch {
      vectorFallback.ensureFallbackTables(entry.db)
    }
  }
  return entry
}

export function closeAll(): void {
  for (const { db } of handles.values()) db.close()
  handles.clear()
}

export function getVecStatus(dbPath: string) {
  const entry = getEntry(dbPath)
  return {
    available: entry.vecLoaded,
    path: entry.vecPath ?? null,
    error: entry.vecLoaded ? null : lastVecError,
  }
}

export function ensureVectorSchema(dbPath: string) {
  const { db, vecLoaded } = getEntry(dbPath)
  if (vecLoaded) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[768]
      )
    `)
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vector_slices USING vec0(
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        session_id TEXT,
        memory_type TEXT NOT NULL,
        embedding FLOAT[768]
      )
    `)
    return { mode: "vec0" as const }
  }
  vectorFallback.ensureFallbackTables(db)
  return { mode: "fallback" as const }
}

function bindParams(params: unknown): unknown[] {
  if (params == null) return []
  const list = Array.isArray(params) ? params : [params]
  return list.map(toVecBinding)
}

export function runStatement(dbPath: string, sql: string, params: unknown[] = []) {
  const { db, vecLoaded } = getEntry(dbPath)
  if (!vecLoaded && usesVecSql(sql)) {
    throw new VecUnavailableError(
      `sqlite-vec 未加载，无法执行向量 SQL。${lastVecError ? `原因: ${lastVecError}` : ""}`
    )
  }
  const result = db.prepare(sql).run(...bindParams(params))
  return {
    lastInsertRowid: Number(result?.lastInsertRowid ?? 0),
    changes: Number(result?.changes ?? 0),
  }
}

export function selectStatement(dbPath: string, sql: string, params: unknown[] = []) {
  const { db, vecLoaded } = getEntry(dbPath)
  if (!vecLoaded && usesVecSql(sql)) {
    throw new VecUnavailableError(
      `sqlite-vec 未加载，无法执行向量 SQL。${lastVecError ? `原因: ${lastVecError}` : ""}`
    )
  }
  return db.prepare(sql).all(...bindParams(params))
}

export { vectorFallback }
