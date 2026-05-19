import { buildInfoSchema, type BuildInfo } from "~/schemas/bootstrap"

type RuntimeMetrics = {
  cpuCount: number
  cpuUsagePercent: number
  totalMemoryGb: number
  availableMemoryGb: number
  pressure: "low" | "medium" | "high"
  recommendedModelId?: string
  recommendedReason: string
}

type DirEntry = {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export type ModelCatalogItem = {
  id: string
  title: string
  subtitle: string
  fileName: string
  sizeLabel: string
  sizeBytes: number
  minMemoryGb: number
  fit: string[]
  installed: boolean
  path: string | null
  status: "available" | "ready" | "downloading" | "error"
  progress: number | null
  downloadedBytes: number
  totalBytes: number
}

type ElectronApi = {
  getBuildInfo: () => Promise<BuildInfo>
  getRuntimeMetrics: () => Promise<RuntimeMetrics>
  getModelCatalog: () => Promise<ModelCatalogItem[]>
  listLlmModels: () => Promise<{ id: string; name: string; path: string }[]>
  downloadModel: (modelId: string) => Promise<ModelCatalogItem>
  deleteModel: (modelId: string) => Promise<ModelCatalogItem>
  onModelDownloadProgress: (handler: (item: ModelCatalogItem) => void) => () => void
  appDataDir: () => Promise<string>
  join: (...parts: string[]) => Promise<string>
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  readTextFile: (path: string) => Promise<string>
  writeTextFile: (path: string, content: string) => Promise<void>
  remove: (path: string) => Promise<void>
  readDir: (path: string) => Promise<DirEntry[]>
  sqliteExecute: (dbPath: string, sql: string, params?: unknown[]) => Promise<{
    rows: unknown[]
    lastInsertRowid: number
    changes: number
  }>
  sqliteSelect: <T = Record<string, unknown>>(dbPath: string, sql: string, params?: unknown[]) => Promise<T[]>
}

declare global {
  interface Window {
    electronAPI?: ElectronApi
  }
}

function getElectronApi(): ElectronApi {
  if (typeof window === "undefined" || !window.electronAPI) {
    throw new Error("Electron API is only available in the desktop runtime.")
  }
  return window.electronAPI
}

export async function getBuildInfo(): Promise<BuildInfo> {
  return buildInfoSchema.parse(await getElectronApi().getBuildInfo())
}

export async function getRuntimeMetrics(): Promise<RuntimeMetrics> {
  return getElectronApi().getRuntimeMetrics()
}

export async function listLlmModels(): Promise<{ id: string; name: string; path: string }[]> {
  return getElectronApi().listLlmModels()
}

export async function getModelCatalog(): Promise<ModelCatalogItem[]> {
  return getElectronApi().getModelCatalog()
}

export async function downloadModel(modelId: string): Promise<ModelCatalogItem> {
  return getElectronApi().downloadModel(modelId)
}

export async function deleteModel(modelId: string): Promise<ModelCatalogItem> {
  return getElectronApi().deleteModel(modelId)
}

export function onModelDownloadProgress(handler: (item: ModelCatalogItem) => void): () => void {
  return getElectronApi().onModelDownloadProgress(handler)
}

export async function appDataDir(): Promise<string> {
  return getElectronApi().appDataDir()
}

export async function join(...parts: string[]): Promise<string> {
  return getElectronApi().join(...parts)
}

export async function exists(path: string): Promise<boolean> {
  return getElectronApi().exists(path)
}

export async function mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
  await getElectronApi().mkdir(path, options)
}

export async function readTextFile(path: string): Promise<string> {
  return getElectronApi().readTextFile(path)
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await getElectronApi().writeTextFile(path, content)
}

export async function remove(path: string): Promise<void> {
  await getElectronApi().remove(path)
}

export async function readDir(path: string): Promise<DirEntry[]> {
  return getElectronApi().readDir(path)
}

export async function sqliteExecute(dbPath: string, sql: string, params: unknown[] = []) {
  return getElectronApi().sqliteExecute(dbPath, sql, params)
}

export async function sqliteSelect<T = Record<string, unknown>>(dbPath: string, sql: string, params: unknown[] = []) {
  return getElectronApi().sqliteSelect<T>(dbPath, sql, params)
}
