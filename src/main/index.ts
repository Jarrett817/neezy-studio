import "./chromium-fetch"
import "./core-ipc"

import type { BrowserWindow } from "electron"
import { app, BrowserWindow as BrowserWindowCtor, dialog, ipcMain } from "electron"

import {
  applyPlaywrightBrowsersPath,
  ensurePlaywrightChromium,
} from "./playwright-browser-setup"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { applyAppConfig } from "./app-config-sync"
import { loadAppConfig } from "./app-config"
import { initBundledEmbedding } from "./bundled-embedding"
import { initMainLogger, log } from "./logger"
import * as chatRouter from "./chat-router"
import * as embeddingRuntime from "./embedding-runtime"
import { resolveEntryApiKey } from "./chat-model-entry"
import { resolveChatModelEntry } from "./model-routing"
import { getRuntimeMetrics } from "./runtime-metrics"
import * as storagePaths from "./storage-paths"
import { registerCoreIpcHandlers } from "./core-ipc"
import { registerIpcHandlers } from "./ipc-handlers"
import { warmSkillCatalog } from "./skill-install"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import * as sqliteRuntime from "./sqlite-runtime"
import type { ChatLoadPayload, ChatLoadResult, StoragePaths } from "./types"

const mainDir =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
let mainWindow: BrowserWindow | null = null

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

async function loadEmbeddingModel(_modelId?: string, _preferLowPower?: boolean) {
  return embeddingRuntime.loadEmbeddingModel()
}

async function loadChatModel(payload: ChatLoadPayload): Promise<ChatLoadResult> {
  return chatRouter.loadChatModel(payload.modelPath, payload)
}

async function getChatModelFileInfo(modelName: string) {
  const settings = getSyncedRuntimeSettings()
  const entry = resolveChatModelEntry(settings)
  const name = modelName.trim() || entry?.model.trim() || settings.llmProvider.model.trim()
  const key = entry
    ? resolveEntryApiKey(entry, settings.llmProvider)
    : settings.llmProvider.apiKey.trim()

  if (!key) {
    return {
      ok: false as const,
      reason: "请先在「模型与连接」配置 API Key",
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
  runtimeMetrics: getRuntimeMetrics,
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
    applyPlaywrightBrowsersPath()
    void initBundledEmbedding().catch((error) => {
      log.warn(
        "[main] 内置 Embedding 预加载失败:",
        error instanceof Error ? error.message : error
      )
    })
    const vecStatus = getSqliteRuntime().getVecStatus(paths.databaseFile)
    console.log(
      `[main] SQLite @libsql/client · 向量 ${vecStatus.available ? "F32_BLOB" : "未就绪"}`,
      vecStatus.error ?? ""
    )

    await createWindow()

    void warmSkillCatalog().catch((error) => {
      log.warn(
        "[main] Skill 目录预热失败:",
        error instanceof Error ? error.message : error
      )
    })

    void ensurePlaywrightChromium().catch((error) => {
      log.warn(
        "[main] Chromium 后台下载失败（使用 browser_* 时会重试）:",
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
  chatRouter.unloadChatModel().catch(() => {})
})
