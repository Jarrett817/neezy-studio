import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"

import { setAgentToolRuntimeContext } from "./ollama/agent-tools"
import * as ollamaCatalog from "./ollama/catalog"
import * as ollamaChat from "./ollama/chat-runtime"
import * as ollamaEmbed from "./ollama/embed-runtime"
import { configureOllamaStorage } from "./ollama/env"
import { ensureOllama } from "./ollama/lifecycle"
import { getOllamaRuntimeMetrics, getModelCatalogItems } from "./ollama/metrics"
import * as storagePaths from "./storage-paths"
import { registerIpcHandlers } from "./ipc-handlers"
import type {
  ChatLoadPayload,
  ChatLoadResult,
  ChatPromptOptions,
  ModelKind,
  StoragePaths,
} from "./types"

const isDev = process.argv.includes("--dev")
let devServer: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let sqliteRuntimeModule: typeof import("./sqlite-runtime") | null = null

const activeDownloads = new Map<
  string,
  { progress: number; ollamaName: string }
>()

function getSqliteRuntime() {
  if (!sqliteRuntimeModule) {
    sqliteRuntimeModule = require("./sqlite-runtime") as typeof import("./sqlite-runtime")
  }
  return sqliteRuntimeModule
}

function getPaths(): StoragePaths {
  return storagePaths.resolveStoragePaths(app)
}

function appDataDir(): string {
  return getPaths().dataRoot
}

function modelsDir(): string {
  return getPaths().modelsDir
}

function syncOllamaStorageEnv(): void {
  configureOllamaStorage(modelsDir())
}

function closeAllSqliteHandles(): void {
  getSqliteRuntime().closeAll()
}

function broadcastModelCatalogUpdated(): void {
  if (!mainWindow) return
  mainWindow.webContents.send("model-catalog-updated")
}

async function sendModelProgress(modelId: string) {
  const entry = ollamaCatalog.findCatalogEntry(modelId)
  if (!entry || !mainWindow) return
  const pull = activeDownloads.get(modelId)
  const item = ollamaCatalog.modelToCatalogItem(entry, {
    installed: ollamaCatalog.isModelInstalled(entry.fileName),
    status: pull
      ? "downloading"
      : ollamaCatalog.isModelInstalled(entry.fileName)
        ? "ready"
        : "available",
    progress: pull?.progress ?? null,
    downloadedBytes: 0,
    totalBytes: entry.sizeBytes,
    cancellable: Boolean(pull),
  })
  mainWindow.webContents.send("model-download-progress", item)
}

async function refreshModelCatalog(): Promise<void> {
  await ollamaCatalog.refreshModelCatalog()
  broadcastModelCatalogUpdated()
}

async function getModelCatalog(kind?: ModelKind) {
  await ollamaCatalog.ensureModelRegistry()
  const items = await getModelCatalogItems(kind)
  return items.map((model) => {
    const pull = [...activeDownloads.entries()].find(([, v]) => {
      const e = ollamaCatalog.findCatalogEntry(model.id)
      return e && v.ollamaName === e.fileName
    })
    if (!pull) return model
    const [, state] = pull
    return {
      ...model,
      status: "downloading" as const,
      progress: state.progress,
      cancellable: true,
    }
  })
}

async function downloadModel(modelId: string) {
  await ensureOllama()
  const entry = ollamaCatalog.findCatalogEntry(modelId)
  if (!entry) throw new Error("Unknown model")
  if (activeDownloads.has(modelId)) {
    return getModelCatalog(entry.kind).then((list) => list.find((m) => m.id === modelId))
  }
  activeDownloads.set(modelId, { progress: 0, ollamaName: entry.fileName })
  sendModelProgress(modelId)
  try {
    await ollamaCatalog.pullModel(entry.fileName, (progress) => {
      const state = activeDownloads.get(modelId)
      if (state) state.progress = progress
      sendModelProgress(modelId)
    })
    activeDownloads.delete(modelId)
    await ollamaCatalog.refreshInstalledNames()
    broadcastModelCatalogUpdated()
    const items = await getModelCatalog(entry.kind)
    return items.find((m) => m.id === modelId)
  } catch (error) {
    activeDownloads.delete(modelId)
    sendModelProgress(modelId)
    throw error
  }
}

async function cancelModelDownload(modelId: string) {
  const entry = ollamaCatalog.findCatalogEntry(modelId)
  if (entry) ollamaCatalog.cancelPull(entry.fileName)
  activeDownloads.delete(modelId)
  const items = await getModelCatalog(entry?.kind)
  return items.find((m) => m.id === modelId)
}

async function deleteModel(modelId: string) {
  const entry = ollamaCatalog.findCatalogEntry(modelId)
  if (!entry) throw new Error("Unknown model")
  await ensureOllama()
  await ollamaCatalog.deleteOllamaModel(entry.fileName)
  activeDownloads.delete(modelId)
  broadcastModelCatalogUpdated()
  const items = await getModelCatalog(entry.kind)
  return items.find((m) => m.id === modelId)
}

async function loadEmbeddingModel(modelId: string, preferLowPower = false) {
  await ollamaChat.unloadChatModel().catch(() => {})
  const entry = ollamaCatalog.findCatalogEntry(modelId)
  if (!entry || entry.kind !== "embedding") throw new Error("Unknown embedding model")
  return ollamaEmbed.loadEmbeddingModel(entry.fileName, modelId, { preferLowPower })
}

async function loadChatModel(payload: ChatLoadPayload): Promise<ChatLoadResult> {
  await ollamaEmbed.unloadEmbeddingModel().catch(() => {})
  const name = payload.modelPath
  return ollamaChat.loadChatModel(name, payload)
}

async function getChatModelFileInfo(modelName: string) {
  await ensureOllama().catch(() => {})
  const entry = ollamaCatalog.findCatalogEntryByName(modelName)
  const name = entry?.fileName ?? modelName
  if (!ollamaCatalog.isModelInstalled(name)) {
    await ollamaCatalog.refreshInstalledNames()
  }
  if (!ollamaCatalog.isModelInstalled(name)) {
    return {
      ok: false,
      reason: `模型 ${name} 未在 Ollama 中安装，请先在模型页下载。`,
    }
  }
  return {
    ok: true,
    filePath: name,
    sizeBytes: entry?.sizeBytes,
    expectedBytes: entry?.sizeBytes ?? null,
    reason: null,
  }
}

const ipcCtx = {
  app,
  ipcMain,
  dialog,
  path,
  fs,
  fsSync,
  os,
  storagePaths,
  get mainWindow() {
    return mainWindow
  },
  getPaths,
  appDataDir,
  modelsDir,
  syncOllamaStorageEnv,
  closeAllSqliteHandles,
  runtimeMetrics: getOllamaRuntimeMetrics,
  ensureModelRegistry: () => ollamaCatalog.ensureModelRegistry(),
  getKnownModelFileNames: () =>
    ollamaCatalog.getAllModelDefinitions().map((m) => m.fileName),
  getModelsByKind: ollamaCatalog.getModelsByKind,
  getModelCatalog,
  refreshModelCatalog,
  invalidateModelScanCache: () => {},
  downloadModel,
  cancelModelDownload,
  deleteModel,
  loadEmbeddingModel,
  unloadEmbeddingModel: ollamaEmbed.unloadEmbeddingModel,
  loadChatModel,
  unloadChatModel: ollamaChat.unloadChatModel,
  resetChatHistory: ollamaChat.resetChatHistory,
  chatPrompt: ollamaChat.chatPrompt,
  chatPromptStream: ollamaChat.chatPromptStream,
  getChatModelStatus: ollamaChat.getChatModelStatus,
  getChatModelFileInfo,
  embedTexts: ollamaEmbed.embedTexts,
  getEmbeddingStatus: ollamaEmbed.getEmbeddingStatus,
  getSqlite: (dbPath: string) => getSqliteRuntime().openDatabase(dbPath),
  get sqliteRuntime() {
    return getSqliteRuntime()
  },
}

setAgentToolRuntimeContext({
  getPaths,
  runSelect: (dbPath, sql, params) =>
    getSqliteRuntime().selectStatement(dbPath, sql, params ?? []) as Record<
      string,
      unknown
    >[],
  runExecute: (dbPath, sql, params) => {
    getSqliteRuntime().runStatement(dbPath, sql, params ?? [])
  },
  embedTexts: async (text) => (await ollamaEmbed.embedTexts(text)) as number[],
})

registerIpcHandlers(ipcCtx)

console.log("[main] IPC handlers registered (Ollama)")

async function waitForDevServer(url: string, timeoutMs = 90_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" })
      if (response.ok || response.status === 404) return
    } catch {
      // Vite 尚未就绪
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(`开发服务器未在 ${timeoutMs / 1000}s 内启动：${url}`)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Neezy Studio",
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    await waitForDevServer("http://127.0.0.1:5173")
    await mainWindow.loadURL("http://127.0.0.1:5173")
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "build", "client", "index.html"))
  }
}

function startDevServer() {
  if (!isDev) return
  devServer = spawn("bun", ["run", "dev", "--host", "127.0.0.1"], {
    cwd: path.join(__dirname, ".."),
    shell: process.platform === "win32",
    stdio: "inherit",
  })
}

app.whenReady().then(async () => {
  try {
    const paths = getPaths()
    await storagePaths.ensureStorageDirs(paths)
    syncOllamaStorageEnv()
    console.info("[main] 正在准备 Ollama…")
    await ensureOllama()
    await ollamaCatalog.ensureModelRegistry()
    const vecStatus = getSqliteRuntime().getVecStatus(paths.databaseFile)
    console.log(
      `[main] sqlite-vec ${vecStatus.available ? "ready" : "fallback"}${vecStatus.path ? ` (${vecStatus.path})` : ""}`,
      vecStatus.error ?? ""
    )
    startDevServer()
    await createWindow()
  } catch (error) {
    console.error("[main] startup failed:", error)
    dialog.showErrorBox(
      "Neezy Studio 启动失败",
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => console.error("[main] createWindow failed:", error))
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  if (sqliteRuntimeModule) sqliteRuntimeModule.closeAll()
  ollamaEmbed.unloadEmbeddingModel().catch(() => {})
  ollamaChat.unloadChatModel().catch(() => {})
  if (devServer) devServer.kill()
})
