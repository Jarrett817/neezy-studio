const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const path = require("node:path")
const fs = require("node:fs/promises")
const fsSync = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")
const storagePaths = require("./storage-paths.cjs")
const { registerIpcHandlers } = require("./ipc-handlers.cjs")

const isDev = process.argv.includes("--dev")
let devServer = null
let mainWindow = null
let sqliteRuntime = null
const activeDownloads = new Map()

function getSqliteRuntime() {
  if (!sqliteRuntime) {
    sqliteRuntime = require("./sqlite-runtime.cjs")
  }
  return sqliteRuntime
}

let heavy = null

function ensureHeavy() {
  if (heavy) return heavy
  heavy = {
    loadElectronLlm: require("@electron/llm/main").loadElectronLlm,
    downloadModelFile: require("./model-download.cjs").downloadModelFile,
    ...require("./model-catalog.cjs"),
    buildModelRecommendations: require("./model-recommendations.cjs").buildModelRecommendations,
    embeddingRuntime: require("./embedding-runtime.cjs"),
  }
  return heavy
}

function getPaths() {
  return storagePaths.resolveStoragePaths(app)
}

function appDataDir() {
  return getPaths().dataRoot
}

function modelsDir() {
  return getPaths().modelsDir
}

function closeAllSqliteHandles() {
  if (sqliteRuntime) sqliteRuntime.closeAll()
}

function getModelFilePath(model) {
  return path.join(modelsDir(), model.fileName)
}

function findInstalledModelFile(model) {
  const names = [model.fileName, ...(model.aliases || [])]
  for (const name of names) {
    const fullPath = path.join(modelsDir(), name)
    if (fsSync.existsSync(fullPath)) return fullPath
  }
  return null
}

function modelStatus(model) {
  const filePath = findInstalledModelFile(model)
  const download = activeDownloads.get(model.id)
  return {
    ...model,
    installed: Boolean(filePath),
    path: filePath,
    fileName: filePath ? path.basename(filePath) : model.fileName,
    status: download?.status ?? (filePath ? "ready" : "available"),
    progress: download?.progress ?? null,
    downloadedBytes: download?.downloadedBytes ?? 0,
    totalBytes: download?.totalBytes ?? model.sizeBytes,
  }
}

function sendModelProgress(modelId) {
  const { findModel } = ensureHeavy()
  const model = findModel(modelId)
  if (!model || !mainWindow) return
  mainWindow.webContents.send("model-download-progress", modelStatus(model))
}

function getSqlite(dbPath) {
  return getSqliteRuntime().openDatabase(dbPath)
}

function runtimeMetrics() {
  const { buildModelRecommendations } = ensureHeavy()
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024
  const availableMemoryGb = os.freemem() / 1024 / 1024 / 1024
  const usedRatio = totalMemoryGb === 0 ? 0 : 1 - availableMemoryGb / totalMemoryGb
  const pressure = usedRatio > 0.82 ? "high" : usedRatio > 0.65 ? "medium" : "low"

  const base = {
    cpuCount: os.cpus().length,
    cpuUsagePercent: Math.round(os.loadavg()[0] * 100) / 100,
    totalMemoryGb: Math.round(totalMemoryGb * 10) / 10,
    availableMemoryGb: Math.round(availableMemoryGb * 10) / 10,
    pressure,
  }

  return {
    ...base,
    ...buildModelRecommendations({
      metrics: base,
      isInstalled: (model) => Boolean(findInstalledModelFile(model)),
    }),
  }
}

async function downloadModel(modelId) {
  const { findModel, downloadModelFile: download } = ensureHeavy()
  const model = findModel(modelId)
  if (!model) throw new Error("Unknown model")
  if (findInstalledModelFile(model)) return modelStatus(model)
  if (activeDownloads.has(modelId)) return modelStatus(model)

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
    await download(model, destination, ({ downloadedBytes, totalBytes, progress }) => {
      const state = activeDownloads.get(modelId)
      if (!state) return
      state.downloadedBytes = downloadedBytes
      state.totalBytes = totalBytes || state.totalBytes
      state.progress = progress
      sendModelProgress(modelId)
    })
    activeDownloads.delete(modelId)
    sendModelProgress(modelId)
    return modelStatus(model)
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

async function deleteModel(modelId) {
  const { findModel } = ensureHeavy()
  const model = findModel(modelId)
  if (!model) throw new Error("Unknown model")
  const filePath = findInstalledModelFile(model)
  if (filePath) await fs.rm(filePath, { force: true })
  return modelStatus(model)
}

async function loadEmbeddingModel(modelId) {
  const { findModel, embeddingRuntime } = ensureHeavy()
  const model = findModel(modelId)
  if (!model || model.kind !== "embedding") throw new Error("Unknown embedding model")
  const filePath = findInstalledModelFile(model)
  if (!filePath) throw new Error("请先下载 Embedding 模型")
  return embeddingRuntime.loadEmbeddingModel(filePath, model.id)
}

function embedTexts(texts) {
  return ensureHeavy().embeddingRuntime.embedTexts(texts)
}

function getEmbeddingStatus() {
  return ensureHeavy().embeddingRuntime.getEmbeddingStatus()
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
    return ensureHeavy().ALL_MODELS
  },
  getModelsByKind(kind) {
    return ensureHeavy().getModelsByKind(kind)
  },
  modelStatus,
  downloadModel,
  deleteModel,
  loadEmbeddingModel,
  embedTexts,
  getEmbeddingStatus,
  getSqlite,
  get sqliteRuntime() {
    return getSqliteRuntime()
  },
}

registerIpcHandlers(ipcCtx)
console.log("[main] IPC handlers registered (app:get-storage-paths, …)")

async function waitForDevServer(url, timeoutMs = 90_000) {
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
      preload: path.join(__dirname, "preload.cjs"),
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
    // 必须在 createWindow 之前加载，否则 renderer 没有 window.electronAi
    const { loadElectronLlm } = ensureHeavy()
    await loadElectronLlm({
      getModelPath: (modelAlias) => path.join(modelsDir(), modelAlias),
    })

    startDevServer()
    await createWindow()
  } catch (error) {
    console.error("[main] startup failed:", error)
    dialog.showErrorBox("Neezy Studio 启动失败", error instanceof Error ? error.message : String(error))
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
  if (sqliteRuntime) sqliteRuntime.closeAll()
  if (heavy) heavy.embeddingRuntime.unloadEmbeddingModel().catch(() => {})
  if (devServer) devServer.kill()
})
