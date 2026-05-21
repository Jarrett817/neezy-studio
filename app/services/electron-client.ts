import { buildInfoSchema, type BuildInfo } from "~/schemas/bootstrap"

export type ModelTier = "light" | "balanced" | "performance"
export type ModelKind = "chat" | "embedding"

export type RuntimeMetrics = {
  cpuCount: number
  cpuUsagePercent: number
  totalMemoryGb: number
  availableMemoryGb: number
  pressure: "low" | "medium" | "high"
  chatTier: ModelTier
  embeddingTier: ModelTier
  recommendedChatId: string | null
  recommendedEmbeddingId: string | null
  recommendedReason: string
  systemSummary: string
  chatAlternatives: string[]
  embeddingAlternatives: string[]
}

type DirEntry = {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export type ModelCatalogItem = {
  id: string
  kind: ModelKind
  tier: ModelTier
  tierLabel: string
  title: string
  subtitle: string
  fileName: string
  sizeLabel: string
  sizeBytes: number
  minMemoryGb: number
  embeddingDim?: number
  fit: string[]
  installed: boolean
  path: string | null
  status: "available" | "ready" | "downloading" | "error"
  progress: number | null
  downloadedBytes: number
  totalBytes: number
}

export type ChatLoadPayload = {
  modelPath: string
  preferLowPower?: boolean
  systemPrompt?: string
  temperature?: number
  topK?: number
}

export type ModelLayerSplit = "cpu" | "gpu" | "mixed" | "auto"

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

export type ChatStreamPayload = {
  requestId: string
  input: string
  temperature?: number
  topK?: number
  maxTokens?: number
}

export type ChatStreamSegment = "thought" | "answer"

export type ChatStreamEvent = {
  requestId: string
  type: "chunk" | "done" | "error"
  /** 增量文本（主进程按 token 推送） */
  delta?: string
  segment?: ChatStreamSegment
  error?: string
}

export type ChatSyncMessage = {
  role: "system" | "user" | "assistant"
  content: string
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

type ElectronApi = {
  getBuildInfo: () => Promise<BuildInfo>
  getRuntimeMetrics: () => Promise<RuntimeMetrics>
  getModelCatalog: (kind?: ModelKind) => Promise<ModelCatalogItem[]>
  getModelRecommendations: () => Promise<RuntimeMetrics>
  loadEmbeddingModel: (
    modelId: string,
    preferLowPower?: boolean
  ) => Promise<{ embeddingDim: number; modelId: string | null }>
  unloadEmbeddingModel: () => Promise<void>
  loadChatModel: (payload: ChatLoadPayload) => Promise<ChatLoadResult>
  unloadChatModel: () => Promise<void>
  resetChatHistory: () => Promise<void>
  primeChatHistory: (messages: ChatSyncMessage[]) => Promise<void>
  getChatModelStatus: () => Promise<{ loaded: boolean; modelPath: string | null }>
  chatPrompt: (
    input: string,
    options?: ChatPromptOptions
  ) => Promise<string>
  chatPromptStream: (payload: ChatStreamPayload) => Promise<void>
  onChatStream: (
    handler: (event: ChatStreamEvent) => void
  ) => () => void
  getChatModelFileInfo: (fileName: string) => Promise<{
    ok: boolean
    filePath?: string
    sizeBytes?: number
    expectedBytes?: number | null
    reason?: string | null
  }>
  getEmbeddings: (texts: string | string[]) => Promise<number[] | number[][]>
  getEmbeddingStatus: () => Promise<{
    loaded: boolean
    filePath: string | null
    modelId: string | null
    embeddingDim: number
  }>
  listLlmModels: () => Promise<{ id: string; name: string; path: string }[]>
  downloadModel: (modelId: string) => Promise<ModelCatalogItem>
  deleteModel: (modelId: string) => Promise<ModelCatalogItem>
  onModelDownloadProgress: (
    handler: (item: ModelCatalogItem) => void
  ) => () => void
  appDataDir: () => Promise<string>
  getStoragePaths: () => Promise<StoragePaths>
  saveStoragePaths: (input: {
    dataRoot: string
    modelsDir: string
  }) => Promise<StoragePaths>
  resetStoragePaths: () => Promise<StoragePaths>
  pickDirectory: (options?: {
    title?: string
    defaultPath?: string
  }) => Promise<string | null>
  getMigrationsDir: () => Promise<string>
  join: (...parts: string[]) => Promise<string>
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  readTextFile: (path: string) => Promise<string>
  writeTextFile: (path: string, content: string) => Promise<void>
  remove: (path: string) => Promise<void>
  readDir: (path: string) => Promise<DirEntry[]>
  sqliteExecute: (
    dbPath: string,
    sql: string,
    params?: unknown[]
  ) => Promise<{
    ok?: boolean
    vecUnavailable?: boolean
    error?: string
    rows: unknown[]
    lastInsertRowid: number
    changes: number
  }>
  sqliteSelect: <T = Record<string, unknown>>(
    dbPath: string,
    sql: string,
    params?: unknown[]
  ) => Promise<T[]>
  sqliteVecStatus: (dbPath: string) => Promise<{
    available: boolean
    path: string | null
    error: string | null
  }>
  sqliteEnsureVectorSchema: (
    dbPath: string
  ) => Promise<{ mode: "vec0" | "fallback" }>
  sqliteVectorUpsertMemory: (
    dbPath: string,
    id: string,
    embedding: number[]
  ) => Promise<{ mode: "vec0" | "fallback" }>
  sqliteVectorDeleteMemory: (
    dbPath: string,
    id: string
  ) => Promise<{ mode: "vec0" | "fallback" }>
  sqliteVectorSearchMemories: (
    dbPath: string,
    embedding: number[],
    limit?: number
  ) => Promise<{ mode: "vec0" | "fallback"; rows: Record<string, unknown>[] }>
  sqliteVectorUpsertSlice: (
    dbPath: string,
    id: string,
    content: string,
    sessionId: string | null,
    memoryType: string,
    embedding: number[]
  ) => Promise<{ mode: "vec0" | "fallback" }>
  sqliteVectorSearchSlices: (
    dbPath: string,
    embedding: number[],
    limit?: number,
    memoryType?: string | null
  ) => Promise<{ mode: "vec0" | "fallback"; rows: Record<string, unknown>[] }>
}

declare global {
  interface Window {
    electronAPI?: ElectronApi
  }
}

function getElectronApi(): ElectronApi {
  if (typeof window === "undefined" || !window.electronAPI) {
    throw new Error(
      "Electron API 不可用。请使用 bun run electron:dev 启动桌面应用，不要单独打开浏览器访问 localhost。"
    )
  }
  return window.electronAPI
}

export async function getBuildInfo(): Promise<BuildInfo> {
  return buildInfoSchema.parse(await getElectronApi().getBuildInfo())
}

export async function getRuntimeMetrics(): Promise<RuntimeMetrics> {
  return getElectronApi().getRuntimeMetrics()
}

export async function listLlmModels(): Promise<
  { id: string; name: string; path: string }[]
> {
  return getElectronApi().listLlmModels()
}

export async function getModelCatalog(
  kind?: ModelKind
): Promise<ModelCatalogItem[]> {
  return getElectronApi().getModelCatalog(kind)
}

export async function getModelRecommendations(): Promise<RuntimeMetrics> {
  return getElectronApi().getModelRecommendations()
}

export async function loadEmbeddingModel(
  modelId: string,
  preferLowPower?: boolean
) {
  return getElectronApi().loadEmbeddingModel(modelId, preferLowPower)
}

export async function loadChatModel(payload: ChatLoadPayload) {
  return getElectronApi().loadChatModel(payload)
}

export async function unloadChatModel() {
  return getElectronApi().unloadChatModel()
}

export async function resetChatHistoryFromMain() {
  return getElectronApi().resetChatHistory()
}

export async function primeChatHistoryFromMain(
  messages: ChatSyncMessage[]
) {
  return getElectronApi().primeChatHistory(messages)
}

export async function chatPromptFromMain(
  input: string,
  options?: ChatPromptOptions
) {
  return getElectronApi().chatPrompt(input, options)
}

export function onChatStreamFromMain(
  handler: (event: ChatStreamEvent) => void
): () => void {
  return getElectronApi().onChatStream(handler)
}

export async function chatPromptStreamFromMain(
  payload: ChatStreamPayload
): Promise<void> {
  return getElectronApi().chatPromptStream(payload)
}

export async function unloadEmbeddingModel() {
  return getElectronApi().unloadEmbeddingModel()
}

export async function getChatModelFileInfo(fileName: string) {
  return getElectronApi().getChatModelFileInfo(fileName)
}

/** 渲染进程在 Electron 壳内（有 electronAPI） */
export function isElectronApp(): boolean {
  return typeof window !== "undefined" && window.electronAPI != null
}

export async function getEmbeddingsFromMain(texts: string): Promise<number[]>
export async function getEmbeddingsFromMain(
  texts: string[]
): Promise<number[][]>
export async function getEmbeddingsFromMain(
  texts: string | string[]
): Promise<number[] | number[][]> {
  return getElectronApi().getEmbeddings(texts)
}

export async function getEmbeddingStatus() {
  return getElectronApi().getEmbeddingStatus()
}

export async function downloadModel(
  modelId: string
): Promise<ModelCatalogItem> {
  return getElectronApi().downloadModel(modelId)
}

export async function deleteModel(modelId: string): Promise<ModelCatalogItem> {
  return getElectronApi().deleteModel(modelId)
}

export function onModelDownloadProgress(
  handler: (item: ModelCatalogItem) => void
): () => void {
  return getElectronApi().onModelDownloadProgress(handler)
}

export async function appDataDir(): Promise<string> {
  return getElectronApi().appDataDir()
}

export async function getStoragePaths(): Promise<StoragePaths> {
  return getElectronApi().getStoragePaths()
}

export async function saveStoragePaths(input: {
  dataRoot: string
  modelsDir: string
}): Promise<StoragePaths> {
  return getElectronApi().saveStoragePaths(input)
}

export async function resetStoragePaths(): Promise<StoragePaths> {
  return getElectronApi().resetStoragePaths()
}

export async function pickDirectory(options?: {
  title?: string
  defaultPath?: string
}): Promise<string | null> {
  return getElectronApi().pickDirectory(options)
}

export async function getMigrationsDir(): Promise<string> {
  return getElectronApi().getMigrationsDir()
}

export async function join(...parts: string[]): Promise<string> {
  return getElectronApi().join(...parts)
}

export async function exists(path: string): Promise<boolean> {
  return getElectronApi().exists(path)
}

export async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  await getElectronApi().mkdir(path, options)
}

export async function readTextFile(path: string): Promise<string> {
  return getElectronApi().readTextFile(path)
}

export async function writeTextFile(
  path: string,
  content: string
): Promise<void> {
  await getElectronApi().writeTextFile(path, content)
}

export async function remove(path: string): Promise<void> {
  await getElectronApi().remove(path)
}

export async function readDir(path: string): Promise<DirEntry[]> {
  return getElectronApi().readDir(path)
}

export async function sqliteExecute(
  dbPath: string,
  sql: string,
  params: unknown[] = []
) {
  return getElectronApi().sqliteExecute(dbPath, sql, params)
}

export async function sqliteSelect<T = Record<string, unknown>>(
  dbPath: string,
  sql: string,
  params: unknown[] = []
) {
  return getElectronApi().sqliteSelect<T>(dbPath, sql, params)
}

export async function sqliteVecStatus(dbPath: string) {
  return getElectronApi().sqliteVecStatus(dbPath)
}

export async function sqliteEnsureVectorSchema(dbPath: string) {
  return getElectronApi().sqliteEnsureVectorSchema(dbPath)
}

export async function sqliteVectorUpsertMemory(
  dbPath: string,
  id: string,
  embedding: number[]
) {
  return getElectronApi().sqliteVectorUpsertMemory(dbPath, id, embedding)
}

export async function sqliteVectorDeleteMemory(dbPath: string, id: string) {
  return getElectronApi().sqliteVectorDeleteMemory(dbPath, id)
}

export async function sqliteVectorSearchMemories(
  dbPath: string,
  embedding: number[],
  limit = 10
) {
  return getElectronApi().sqliteVectorSearchMemories(dbPath, embedding, limit)
}

export async function sqliteVectorUpsertSlice(
  dbPath: string,
  id: string,
  content: string,
  sessionId: string | null,
  memoryType: string,
  embedding: number[]
) {
  return getElectronApi().sqliteVectorUpsertSlice(
    dbPath,
    id,
    content,
    sessionId,
    memoryType,
    embedding
  )
}

export async function sqliteVectorSearchSlices(
  dbPath: string,
  embedding: number[],
  limit = 10,
  memoryType: string | null = null
) {
  return getElectronApi().sqliteVectorSearchSlices(
    dbPath,
    embedding,
    limit,
    memoryType
  )
}
