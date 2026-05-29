import "./core-ipc"

import type { BrowserWindow } from "electron"
import { app, BrowserWindow as BrowserWindowCtor, dialog, ipcMain } from "electron"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { applyAppConfig } from "./app-config-sync"
import { loadAppConfig } from "./app-config"
import { initBundledEmbedding } from "./bundled-embedding"
import { initMainLogger, log } from "./logger"
import { setAgentToolRuntimeContext } from "./ollama/agent-tools"
import { initToolContext } from "./pi-tool-registry"
import * as ollamaCatalog from "./ollama/catalog"
import * as chatRouter from "./chat-router"
import * as ollamaChat from "./ollama/chat-runtime"
import * as embeddingRuntime from "./embedding-runtime"
import { ensureOllama } from "./ollama/lifecycle"
import { getOllamaRuntimeMetrics, getModelCatalogItems } from "./ollama/metrics"
import * as storagePaths from "./storage-paths"
import { registerCoreIpcHandlers } from "./core-ipc"
import { registerIpcHandlers } from "./ipc-handlers"
import { resolvedChatUsesApi } from "./model-routing"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import * as sqliteRuntime from "./sqlite-runtime"
import type {
  ChatLoadPayload,
  ChatLoadResult,
  ChatPromptOptions,
  ModelKind,
  StoragePaths,
} from "./types"

const mainDir =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
let mainWindow: BrowserWindow | null = null

const activeDownloads = new Map<
  string,
  { progress: number; ollamaName: string }
>()

function getSqliteRuntime() {
  return sqliteRuntime
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

async function loadEmbeddingModel(_modelId?: string, _preferLowPower?: boolean) {
  return embeddingRuntime.loadEmbeddingModel()
}

async function loadChatModel(payload: ChatLoadPayload): Promise<ChatLoadResult> {
  return chatRouter.loadChatModel(payload.modelPath, payload)
}

async function getChatModelFileInfo(modelName: string) {
  if (resolvedChatUsesApi()) {
    const settings = getSyncedRuntimeSettings()
    const name = modelName.trim() || settings.llmProvider.model.trim()
    if (!settings.llmProvider.apiKey.trim()) {
      return {
        ok: false as const,
        reason: "请先在设置 → 对话模型来源 中配置 API Key",
      }
    }
    if (!name) {
      return { ok: false as const, reason: "未配置模型名称" }
    }
    return {
      ok: true as const,
      filePath: name,
      reason: null,
    }
  }
  await ensureOllama().catch(() => {})
  const entry = ollamaCatalog.findCatalogEntryByName(modelName)
  const requested = entry?.fileName ?? modelName
  let resolved = ollamaCatalog.resolveInstalledModelRef(requested)
  if (!resolved) {
    await ollamaCatalog.refreshInstalledNames()
    resolved = ollamaCatalog.resolveInstalledModelRef(requested)
  }
  if (!resolved) {
    return {
      ok: false,
      reason: `模型 ${requested} 未在 Ollama 中安装，请先在模型页下载或使用 ollama pull。`,
    }
  }
  return {
    ok: true,
    filePath: resolved,
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
  unloadEmbeddingModel: embeddingRuntime.unloadEmbeddingModel,
  loadChatModel,
  unloadChatModel: chatRouter.unloadChatModel,
  resetChatHistory: chatRouter.resetChatHistory,
  chatPrompt: chatRouter.chatPrompt,
  chatPromptStream: chatRouter.runChatPromptStream,
  getChatModelStatus: chatRouter.getChatModelStatus,
  getChatModelFileInfo,
  embedTexts: embeddingRuntime.embedTexts,
  getEmbeddingStatus: embeddingRuntime.getEmbeddingStatus,
  getSqlite: (dbPath: string) => getSqliteRuntime().openDatabase(dbPath),
  get sqliteRuntime() {
    return getSqliteRuntime()
  },
}

setAgentToolRuntimeContext({
  getPaths,
  runSelect: async (dbPath, sql, params) =>
    (await getSqliteRuntime().selectStatement(dbPath, sql, params ?? [])) as Record<
      string,
      unknown
    >[],
  runExecute: async (dbPath, sql, params) => {
    await getSqliteRuntime().runStatement(dbPath, sql, params ?? [])
  },
  embedTexts: async (text) => (await embeddingRuntime.embedTexts(text)) as number[],
})

initToolContext({
  getPaths,
  runSelect: async (dbPath, sql, params) =>
    (await getSqliteRuntime().selectStatement(
      dbPath,
      sql,
      params ?? []
    )) as Record<string, unknown>[],
  runExecute: async (dbPath, sql, params) => {
    await getSqliteRuntime().runStatement(dbPath, sql, params ?? [])
  },
  embedTexts: async (text) => (await embeddingRuntime.embedTexts(text)) as number[],
})

registerCoreIpcHandlers()
registerIpcHandlers(ipcCtx)

console.log("[main] IPC handlers registered")

async function createWindow() {
  mainWindow = new BrowserWindowCtor({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Neezy Studio",
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(mainDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, validatedURL) => {
      console.error(
        `[main] renderer load failed: ${validatedURL} (${code}) ${description}`
      )
    }
  )

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
  })

  // 与官方 react-ts 一致：开发 loadURL，生产 loadFile（renderer 侧 holdUntilCrawlEnd 避免首启 ERR_ABORTED）
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl)
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: "detach" })
    }
  } else {
    await mainWindow.loadFile(path.join(mainDir, "../renderer/index.html"))
  }
}

app.whenReady().then(async () => {
  try {
    await initMainLogger()
    const paths = getPaths()
    await storagePaths.ensureStorageDirs(paths)
    const appConfig = loadAppConfig(app)
    applyAppConfig(app, appConfig)
    void initBundledEmbedding().catch((error) => {
      log.warn(
        "[main] 内置 Embedding 预加载失败:",
        error instanceof Error ? error.message : error
      )
    })
    await ollamaCatalog.ensureModelRegistry()
    const vecStatus = getSqliteRuntime().getVecStatus(paths.databaseFile)
    console.log(
      `[main] SQLite @libsql/client · 向量 ${vecStatus.available ? "F32_BLOB" : "未就绪"}`,
      vecStatus.error ?? ""
    )

    await createWindow()

    console.info("[main] 正在准备 Ollama…")
    void ensureOllama().catch((error) => {
      console.warn(
        "[main] Ollama 未就绪:",
        error instanceof Error ? error.message : error
      )
    })
  } catch (error) {
    console.error("[main] startup failed:", error)
    dialog.showErrorBox(
      "Neezy Studio 启动失败",
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
  }

  app.on("activate", () => {
    if (BrowserWindowCtor.getAllWindows().length === 0) {
      createWindow().catch((error) => console.error("[main] createWindow failed:", error))
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  sqliteRuntime.closeAll()
  embeddingRuntime.unloadEmbeddingModel().catch(() => {})
  ollamaChat.unloadChatModel().catch(() => {})
})
