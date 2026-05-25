import type { App, BrowserWindow, Dialog, IpcMain } from "electron"
import type { ChildProcess } from "node:child_process"
import type * as Fs from "node:fs/promises"
import type * as FsSync from "node:fs"
import type * as Os from "node:os"
import type * as Path from "node:path"

export const EMBEDDING_DIM = 768

export type ModelTier = "light" | "balanced" | "performance"
export type ModelKind = "chat" | "embedding"
export type CatalogSection = "recommended" | "local"

export interface ModelDefinition {
  id: string
  kind: ModelKind
  /** 对话模型分区：推荐表 / 本机扫描 */
  catalogSection?: CatalogSection
  tier: ModelTier
  tierLabel: string
  title: string
  subtitle: string
  /** node-llama-cpp CLI 推荐说明 */
  description?: string
  /** 下载用 HF URI，本机模型为绝对路径 */
  modelUri: string
  fileName: string
  aliases?: string[]
  abilities?: string[]
  sizeLabel: string
  sizeBytes: number
  minMemoryGb: number
  compatibilityScore?: number
  resolvedContextSize?: number
  embeddingDim?: number
  fit: string[]
  /** 非 CLI 推荐表、仅扫描 models 目录 */
  isLocalOnly?: boolean
  /** 推荐条目的全部 fileOptions（用于多分片 combine 下载） */
  candidateUris?: string[]
  /** 实际下载用的 URI 列表（多分片时长度 > 1） */
  downloadUris?: string[]
}

export type MemoryPressure = "low" | "medium" | "high"

export type RuntimeMetricsBase = {
  cpuCount: number
  cpuUsagePercent: number
  totalMemoryGb: number
  availableMemoryGb: number
  pressure: MemoryPressure
  /** node-llama-cpp llama.getVramState，与 CLI chat 标题一致 */
  gpuLabel?: string
  vramUsedPercent?: number
  vramSummary?: string
  /** 与 `node-llama-cpp inspect gpu` 一致的探测摘要行 */
  gpuInspectLines?: string[]
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
  flashAttention?: boolean
  compatibilityScore?: number
}

export type ChatPromptOptions = {
  temperature?: number
  topK?: number
  maxTokens?: number
  /** 使用 node-llama-cpp 原生 function calling（默认 true） */
  useFunctions?: boolean
}

export type ChatStreamSegment = "thought" | "answer"

export type ChatStreamPayload = {
  requestId: string
  input: string
  primeMessages?: { role: "system" | "user" | "assistant"; content: string }[]
  temperature?: number
  topK?: number
  maxTokens?: number
  useFunctions?: boolean
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
  cancellable?: boolean
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
  ensureModelRegistry: (
    modelsDir: string,
    options?: { waitForRecommended?: boolean }
  ) => Promise<void>
  getKnownModelFileNames: () => string[]
  getModelsByKind: (kind: ModelKind) => ModelDefinition[]
  getModelCatalog: (kind?: ModelKind) => Promise<Record<string, unknown>[]>
  refreshModelCatalog: () => Promise<void>
  invalidateModelScanCache?: () => void
  downloadModel: (modelId: string) => Promise<unknown>
  cancelModelDownload: (modelId: string) => Promise<unknown>
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
