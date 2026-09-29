import type * as FsSync from "node:fs"
import type * as Fs from "node:fs/promises"
import type * as Os from "node:os"
import type * as Path from "node:path"
import type { App, BrowserWindow, Dialog, IpcMain } from "electron"
import type * as StoragePathsModule from "./storage-paths"

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

export type StoragePaths = {
  dataRoot: string
  /** Agent cwd；未单独设置时等于 dataRoot */
  workspaceDir: string
  workspaceCustomized: boolean
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

export type StoragePathsSaveResult = StoragePaths & {
  migration?: {
    from: string
    to: string
    movedCount: number
  }
}

export type ModelDownloadState = {
  status: string
  progress: number | null
  downloadedBytes: number
  totalBytes: number
  error?: string
  cancellable?: boolean
}

export interface IpcContext {
  app: App
  ipcMain: IpcMain
  dialog: Dialog
  path: typeof Path
  fs: typeof Fs
  fsSync: typeof FsSync
  os: typeof Os
  storagePaths: typeof StoragePathsModule
  mainWindow: BrowserWindow | null
  getPaths: () => StoragePaths
  appDataDir: () => string
  modelsDir: () => string
}
