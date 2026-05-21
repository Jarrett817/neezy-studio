import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"

import * as chatLlmRuntime from "./chat-llm-runtime"
import * as embeddingRuntime from "./embedding-runtime"
import { downloadModelFile } from "./model-download"
import {
  ALL_MODELS,
  findModel,
  getModelsByKind,
} from "./model-catalog"
import { buildModelRecommendations } from "./model-recommendations"
import * as modelScan from "./model-scan"
import * as storagePaths from "./storage-paths"
import { registerIpcHandlers } from "./ipc-handlers"
import type {
  ChatLoadPayload,
  ChatLoadResult,
  ChatPromptOptions,
  ModelDefinition,
  ModelDownloadState,
  ModelKind,
  StoragePaths,
} from "./types"

const isDev = process.argv.includes("--dev")
let devServer: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let sqliteRuntimeModule: typeof import("./sqlite-runtime") | null = null

const activeDownloads = new Map<string, ModelDownloadState>()

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

function closeAllSqliteHandles(): void {
  getSqliteRuntime().closeAll()
}

function getModelFilePath(model: ModelDefinition): string {
  return path.join(modelsDir(), model.fileName)
}

async function readModelsScan() {
  return modelScan.scanModelsDir(modelsDir())
}

function modelStatusFromScan(
  model: ModelDefinition,
  scan: Awaited<ReturnType<typeof readModelsScan>>,
  modelsDirPath: string
) {
  const filePath = modelScan.findInstalledModelFile(model, modelsDirPath, scan)
  const download = activeDownloads.get(model.id)
  const part = filePath ? null : modelScan.findPartForModel(model, scan)

  let status = filePath ? "ready" : "available"
  let progress: number | null = null
  let downloadedBytes = 0
  let totalBytes = model.sizeBytes

  if (part) {
    status = "downloading"
    downloadedBytes = part.bytes
    progress =
      totalBytes > 0
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : null
  }

  if (download) {
    status = download.status
    progress = download.progress ?? progress
    downloadedBytes = download.downloadedBytes ?? downloadedBytes
    totalBytes = download.totalBytes ?? totalBytes
  }

  return {
    ...model,
    installed: Boolean(filePath),
    path: filePath,
    fileName: filePath ? path.basename(filePath) : (part?.fileName ?? model.fileName),
    status,
    progress,
    downloadedBytes,
    totalBytes,
    error: download?.error,
  }
}

async function resolveModelStatus(model: ModelDefinition) {
  const scan = await readModelsScan()
  return modelStatusFromScan(model, scan, modelsDir())
}

async function sendModelProgress(modelId: string) {
  const model = findModel(modelId)
  if (!model || !mainWindow) return
  mainWindow.webContents.send("model-download-progress", await resolveModelStatus(model))
}

function getSqlite(dbPath: string) {
  return getSqliteRuntime().openDatabase(dbPath)
}

async function runtimeMetrics() {
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024
  const availableMemoryGb = os.freemem() / 1024 / 1024 / 1024
  const usedRatio = totalMemoryGb === 0 ? 0 : 1 - availableMemoryGb / totalMemoryGb
  const pressure: import("./types").MemoryPressure =
    usedRatio > 0.82 ? "high" : usedRatio > 0.65 ? "medium" : "low"

  const base = {
    cpuCount: os.cpus().length,
    cpuUsagePercent: Math.round(os.loadavg()[0] * 100) / 100,
    totalMemoryGb: Math.round(totalMemoryGb * 10) / 10,
    availableMemoryGb: Math.round(availableMemoryGb * 10) / 10,
    pressure,
  }

  const scan = await readModelsScan()
  const dir = modelsDir()
  return {
    ...base,
    ...buildModelRecommendations({
      metrics: base,
      isInstalled: (model) => Boolean(modelScan.findInstalledModelFile(model, dir, scan)),
    }),
  }
}

async function getModelCatalog(kind?: ModelKind) {
  const scan = await readModelsScan()
  const dir = modelsDir()
  const models = kind ? getModelsByKind(kind) : ALL_MODELS
  return models.map((model) => modelStatusFromScan(model, scan, dir))
}

async function downloadModel(modelId: string) {
  const model = findModel(modelId)
  if (!model) throw new Error("Unknown model")
  const scan = await readModelsScan()
  const dir = modelsDir()
  if (modelScan.findInstalledModelFile(model, dir, scan)) {
    return modelStatusFromScan(model, scan, dir)
  }
  if (activeDownloads.has(modelId)) {
    return modelStatusFromScan(model, scan, dir)
  }

  await fs.mkdir(modelsDir(), { recursive: true })
  activeDownloads.set(modelId, {
    status: "downloading",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: model.sizeBytes,
  })
  sendModelProgress(modelId)

  try {
    const destination = getModelFilePath(model)
    await downloadModelFile(model, destination, ({ downloadedBytes, totalBytes, progress }) => {
      const state = activeDownloads.get(modelId)
      if (!state) return
      state.downloadedBytes = downloadedBytes
      state.totalBytes = totalBytes || state.totalBytes
      state.progress = progress
      sendModelProgress(modelId)
    })
    activeDownloads.delete(modelId)
    sendModelProgress(modelId)
    return resolveModelStatus(model)
  } catch (error) {
    activeDownloads.set(modelId, {
      status: "error",
      progress: null,
      downloadedBytes: 0,
      totalBytes: model.sizeBytes,
      error: error instanceof Error ? error.message : String(error),
    })
    sendModelProgress(modelId)
    throw error
  }
}

async function deleteModel(modelId: string) {
  const model = findModel(modelId)
  if (!model) throw new Error("Unknown model")
  const dir = modelsDir()
  for (const name of modelScan.modelFileCandidates(model)) {
    await fs.rm(path.join(dir, name), { force: true })
    await fs.rm(path.join(dir, `${name}.part`), { force: true })
  }
  activeDownloads.delete(modelId)
  return resolveModelStatus(model)
}

async function loadEmbeddingModel(modelId: string, preferLowPower = false) {
  await chatLlmRuntime.unloadChatModel().catch(() => {})
  const model = findModel(modelId)
  if (!model || model.kind !== "embedding") throw new Error("Unknown embedding model")
  const scan = await readModelsScan()
  const filePath = modelScan.findInstalledModelFile(model, modelsDir(), scan)
  if (!filePath) throw new Error("请先下载 Embedding 模型")
  return embeddingRuntime.loadEmbeddingModel(filePath, model.id, { preferLowPower })
}

async function loadChatModel(payload: ChatLoadPayload): Promise<ChatLoadResult> {
  await embeddingRuntime.unloadEmbeddingModel().catch(() => {})
  return chatLlmRuntime.loadChatModel(payload.modelPath, payload)
}

async function unloadChatModel(): Promise<void> {
  return chatLlmRuntime.unloadChatModel()
}

function resetChatHistory(): void {
  chatLlmRuntime.resetChatHistory()
}

async function chatPrompt(input: string, options?: ChatPromptOptions): Promise<string> {
  return chatLlmRuntime.chatPrompt(input, options)
}

function getChatModelStatus() {
  return chatLlmRuntime.getChatModelStatus()
}

function embedTexts(texts: string | string[]) {
  return embeddingRuntime.embedTexts(texts)
}

function getEmbeddingStatus() {
  return embeddingRuntime.getEmbeddingStatus()
}

async function unloadEmbeddingModel(): Promise<void> {
  await embeddingRuntime.unloadEmbeddingModel()
}

async function getChatModelFileInfo(fileName: string) {
  const chatModels = getModelsByKind("chat")
  const catalogMatch = chatModels.find(
    (m) => m.fileName === fileName || (m.aliases || []).includes(fileName)
  )

  const scan = await readModelsScan()
  const dir = modelsDir()

  if (catalogMatch && modelScan.findPartForModel(catalogMatch, scan)) {
    return {
      ok: false,
      reason: "模型仍在下载中（.part），请等待完成或删除后重新下载。",
    }
  }

  let filePath: string | null = null
  if (catalogMatch) {
    filePath = modelScan.findInstalledModelFile(catalogMatch, dir, scan)
  }
  if (!filePath && scan.gguf.has(fileName)) {
    filePath = path.join(dir, fileName)
  }
  if (!filePath) {
    return { ok: false, reason: "模型文件不存在，请先下载或检查 models 目录。" }
  }

  const stat = await fs.stat(filePath)
  const expectedBytes = catalogMatch?.sizeBytes ?? null
  const sizeBytes = stat.size
  const complete =
    expectedBytes == null || sizeBytes >= Math.floor(expectedBytes * 0.9)

  return {
    ok: complete,
    filePath,
    sizeBytes,
    expectedBytes,
    reason: complete
      ? null
      : `模型文件不完整（约 ${Math.round(sizeBytes / 1e6)} MB / 预期 ${Math.round(expectedBytes! / 1e6)} MB），请重新下载。`,
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
  closeAllSqliteHandles,
  runtimeMetrics,
  get ALL_MODELS() {
    return ALL_MODELS
  },
  getModelsByKind,
  getModelCatalog,
  invalidateModelScanCache: modelScan.invalidateModelScanCache,
  downloadModel,
  deleteModel,
  loadEmbeddingModel,
  unloadEmbeddingModel,
  loadChatModel,
  unloadChatModel,
  resetChatHistory,
  chatPrompt,
  chatPromptStream: chatLlmRuntime.chatPromptStream,
  getChatModelStatus,
  getChatModelFileInfo,
  embedTexts,
  getEmbeddingStatus,
  getSqlite,
  get sqliteRuntime() {
    return getSqliteRuntime()
  },
}

registerIpcHandlers(ipcCtx)

console.log("[main] IPC handlers registered (app:get-storage-paths, …)")

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
  embeddingRuntime.unloadEmbeddingModel().catch(() => {})
  chatLlmRuntime.unloadChatModel().catch(() => {})
  if (devServer) devServer.kill()
})
