const fsSync = require("node:fs")
const path = require("node:path")

let DatabaseSync
try {
  ;({ DatabaseSync } = require("node:sqlite"))
} catch (error) {
  throw new Error(
    `当前 Electron 未提供 node:sqlite（${error instanceof Error ? error.message : error}）。请使用 Electron 42+ 或升级 electron 包。`,
    { cause: error }
  )
}

const sqliteVec = require("sqlite-vec")
const vectorFallback = require("./vector-fallback.cjs")

const handles = new Map()
let lastVecError = null

class VecUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = "VecUnavailableError"
    this.code = "VEC_UNAVAILABLE"
  }
}

function resolveDbPath(input) {
  return input.startsWith("sqlite:") ? input.slice("sqlite:".length) : input
}

function usesVecSql(sql) {
  return /\bvec0\b/i.test(sql) || /\bvec_[a-z]/i.test(sql) || /\bembedding\s+MATCH\b/i.test(sql)
}

function toVecBinding(value) {
  if (
    !Array.isArray(value) ||
    value.length < 16 ||
    typeof value[0] !== "number" ||
    !Number.isFinite(value[0])
  ) {
    return value
  }
  return new Uint8Array(new Float32Array(value).buffer)
}

function loadVecExtension(db) {
  if (typeof db.loadExtension !== "function") {
    throw new Error("DatabaseSync.loadExtension 不可用")
  }
  const extPath = sqliteVec.getLoadablePath()
  db.loadExtension(extPath)
  db.prepare("SELECT vec_version() AS v").get()
  return extPath
}

function openDatabase(dbPath) {
  const resolved = resolveDbPath(dbPath)
  if (!handles.has(resolved)) {
    fsSync.mkdirSync(path.dirname(resolved), { recursive: true })
    const db = new DatabaseSync(resolved, { allowExtension: true })
    let vecLoaded = false
    let vecPath = null
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
  return handles.get(resolved).db
}

function getEntry(dbPath) {
  const resolved = resolveDbPath(dbPath)
  if (!handles.has(resolved)) {
    openDatabase(dbPath)
  }
  const entry = handles.get(resolved)
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

function isVecLoaded(dbPath) {
  return getEntry(dbPath).vecLoaded
}

function getVecStatus(dbPath) {
  const entry = getEntry(dbPath)
  return {
    available: entry.vecLoaded,
    path: entry.vecPath ?? null,
    error: entry.vecLoaded ? null : lastVecError,
  }
}

function ensureVectorSchema(dbPath) {
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
    return { mode: "vec0" }
  }
  vectorFallback.ensureFallbackTables(db)
  return { mode: "fallback" }
}

function closeAll() {
  for (const { db } of handles.values()) db.close()
  handles.clear()
}

function bindParams(params) {
  if (params == null) return []
  const list = Array.isArray(params) ? params : [params]
  return list.map(toVecBinding)
}

function runStatement(dbPath, sql, params = []) {
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

function selectStatement(dbPath, sql, params = []) {
  const { db, vecLoaded } = getEntry(dbPath)
  if (!vecLoaded && usesVecSql(sql)) {
    throw new VecUnavailableError(
      `sqlite-vec 未加载，无法执行向量 SQL。${lastVecError ? `原因: ${lastVecError}` : ""}`
    )
  }
  return db.prepare(sql).all(...bindParams(params))
}

module.exports = {
  VecUnavailableError,
  openDatabase,
  getEntry,
  closeAll,
  isVecLoaded,
  getVecStatus,
  ensureVectorSchema,
  runStatement,
  selectStatement,
  vectorFallback,
}
