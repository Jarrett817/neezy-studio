import type * as FsSync from "node:fs"
import type * as Fs from "node:fs/promises"
import type * as Os from "node:os"
import type * as Path from "node:path"
import type { App, BrowserWindow, Dialog, IpcMain } from "electron"
import type * as StoragePathsModule from "./storage-paths"

export type StoragePaths = {
  dataRoot: string
  workspaceDir: string
  workspaceCustomized: boolean
  configFile: string
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
}
