import type { App, BrowserWindow, Dialog, IpcMain } from "electron"
import type { ChildProcess } from "node:child_process"
import type * as Fs from "node:fs/promises"
import type * as FsSync from "node:fs"
import type * as Os from "node:os"
import type * as Path from "node:path"

export const EMBEDDING_DIM = 768

export type ModelTier = "light" | "balanced" | "performance"
export type ModelKind = "chat" | "embedding"

export interface ModelDefinition {
  id: string
  kind: ModelKind
  tier: ModelTier
  tierLabel: string
  title: string
  subtitle: string
  fileName: string
  aliases?: string[]
  sizeLabel: string
  sizeBytes: number
  minMemoryGb: number
  embeddingDim?: number
  fit: string[]
  repo: string
  repoPath: string
  revision?: string
}

export type MemoryPressure = "low" | "medium" | "high"

export type RuntimeMetricsBase = {
  cpuCount: number
  cpuUsagePercent: number
  totalMemoryGb: number
  availableMemoryGb: number
  pressure: MemoryPressure
}

export type ModelLayerSplit = "cpu" | "gpu" | "mixed" | "auto"

export type ChatLoadPayload = {
  modelPath: string
  preferLowPower?: boolean
  systemPrompt?: string
  temperature?: number
  topK?: number
}

export type ChatLoadResult = {
  modelPath: string
  contextSize: number
  preferLowPower: boolean
  fallbackCpu?: boolean
  gpuLayersOnGpu?: number
  totalLayers?: number
  layerSplit?: ModelLayerSplit
  requestedLayerSplit?: ModelLayerSplit
}

export type ChatPromptOptions = {
  temperature?: number
  topK?: number
  maxTokens?: number
}

export type ChatStreamSegment = "thought" | "answer"

export type ChatStreamPayload = {
  requestId: string
  input: string
  temperature?: number
  topK?: number
  maxTokens?: number
}

export type ChatStreamDelta = {
  segment: ChatStreamSegment
  delta: string
}

export type StoragePaths = {
  dataRoot: string
  modelsDir: string
  databaseFile: string
  memoriesDir: string
  personasDir: string
  skillsDir: string
  configFile: string
  defaultDataRoot: string
  defaultModelsDir: string
  isCustomized: boolean
}

export type ModelDownloadState = {
  status: string
  progress: number | null
  downloadedBytes: number
  totalBytes: number
  error?: string
}

export type SqliteRuntimeModule = {
  VecUnavailableError: new (message: string) => Error & { code: string }
  openDatabase: (dbPath: string) => unknown
  getEntry: (dbPath: string) => { db: unknown; vecLoaded: boolean; vecPath: string | null }
  closeAll: () => void
  getVecStatus: (dbPath: string) => {
    available: boolean
    path: string | null
    error: string | null
  }
  ensureVectorSchema: (dbPath: string) => { mode: "vec0" | "fallback" }
  runStatement: (
    dbPath: string,
    sql: string,
    params?: unknown[]
  ) => { lastInsertRowid: number; changes: number }
  selectStatement: (dbPath: string, sql: string, params?: unknown[]) => unknown[]
  vectorFallback: typeof import("./vector-fallback")
}

export interface IpcContext {
  app: App
  ipcMain: IpcMain
  dialog: Dialog
  path: typeof Path
  fs: typeof Fs
  fsSync: typeof FsSync
  os: typeof Os
  storagePaths: typeof import("./storage-paths")
  mainWindow: BrowserWindow | null
  getPaths: () => StoragePaths
  appDataDir: () => string
  modelsDir: () => string
  closeAllSqliteHandles: () => void
  runtimeMetrics: () => Promise<Record<string, unknown>>
  ALL_MODELS: ModelDefinition[]
  getModelsByKind: (kind: ModelKind) => ModelDefinition[]
  getModelCatalog: (kind?: ModelKind) => Promise<Record<string, unknown>[]>
  invalidateModelScanCache?: () => void
  downloadModel: (modelId: string) => Promise<unknown>
  deleteModel: (modelId: string) => Promise<unknown>
  loadEmbeddingModel: (
    modelId: string,
    preferLowPower?: boolean
  ) => Promise<unknown>
  unloadEmbeddingModel: () => Promise<void>
  loadChatModel: (payload: ChatLoadPayload) => Promise<ChatLoadResult>
  unloadChatModel: () => Promise<void>
  resetChatHistory: () => void
  chatPrompt: (input: string, options?: ChatPromptOptions) => Promise<string>
  chatPromptStream: (
    input: string,
    options?: ChatPromptOptions
  ) => AsyncGenerator<ChatStreamDelta, void, unknown>
  getChatModelStatus: () => {
    loaded: boolean
    modelPath: string | null
    loadInfo: ChatLoadResult | null
  }
  getChatModelFileInfo: (fileName: string) => Promise<{
    ok: boolean
    filePath?: string
    sizeBytes?: number
    expectedBytes?: number | null
    reason?: string | null
  }>
  embedTexts: (texts: string | string[]) => Promise<number[] | number[][]>
  getEmbeddingStatus: () => unknown
  getSqlite: (dbPath: string) => unknown
  sqliteRuntime: SqliteRuntimeModule
}
