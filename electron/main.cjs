const { app, BrowserWindow, ipcMain } = require("electron")
const { loadElectronLlm } = require("@electron/llm/main")
const path = require("node:path")
const fs = require("node:fs/promises")
const fsSync = require("node:fs")
const http = require("node:http")
const https = require("node:https")
const os = require("node:os")
const { spawn } = require("node:child_process")
const Database = require("better-sqlite3")

const isDev = process.argv.includes("--dev")
let devServer = null
let mainWindow = null
const sqliteHandles = new Map()
const activeDownloads = new Map()

const MODEL_CATALOG = [
  {
    id: "qwen3-1.7b-daily",
    title: "日常轻快",
    subtitle: "回复快，占用低，适合聊天、记录和轻量写作。",
    fileName: "Qwen_Qwen3-1.7B-Q4_K_M.gguf",
    aliases: ["Qwen3-1.7B-Q4_K_M.gguf"],
    sizeLabel: "约 1.2 GB",
    sizeBytes: 1190000000,
    minMemoryGb: 8,
    fit: ["日常问答", "轻量写作", "低占用"],
    url: "https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf",
  },
  {
    id: "phi35-mini-balanced",
    title: "稳妥均衡",
    subtitle: "理解和写作更稳，适合大多数家用电脑。",
    fileName: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    aliases: [],
    sizeLabel: "约 2.4 GB",
    sizeBytes: 2400000000,
    minMemoryGb: 12,
    fit: ["长一点的对话", "内容创作", "资料整理"],
    url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
  },
  {
    id: "qwen3-4b-quality",
    title: "表达更好",
    subtitle: "更适合复杂写作和分析，建议内存更充足时使用。",
    fileName: "Qwen_Qwen3-4B-Q4_K_M.gguf",
    aliases: ["Qwen3-4B-Q4_K_M.gguf"],
    sizeLabel: "约 2.6 GB",
    sizeBytes: 2600000000,
    minMemoryGb: 16,
    fit: ["深度分析", "高质量文案", "复杂任务"],
    url: "https://huggingface.co/bartowski/Qwen_Qwen3-4B-GGUF/resolve/main/Qwen_Qwen3-4B-Q4_K_M.gguf",
  },
]

function createWindow() {
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
    mainWindow.loadURL("http://127.0.0.1:5173")
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

function appDataDir() {
  return app.getPath("userData")
}

function modelsDir() {
  return path.join(appDataDir(), "models")
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
  const model = MODEL_CATALOG.find((item) => item.id === modelId)
  if (!model || !mainWindow) return
  mainWindow.webContents.send("model-download-progress", modelStatus(model))
}

function downloadFile(url, destination, modelId) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http
    const request = client.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume()
        downloadFile(new URL(response.headers.location, url).toString(), destination, modelId).then(resolve, reject)
        return
      }

      if ((response.statusCode ?? 0) >= 400) {
        response.resume()
        reject(new Error(`Download failed with status ${response.statusCode}`))
        return
      }

      const totalBytes = Number(response.headers["content-length"] ?? 0)
      const tempPath = `${destination}.download`
      const file = fsSync.createWriteStream(tempPath)
      const state = activeDownloads.get(modelId)
      if (state) {
        state.totalBytes = totalBytes || state.totalBytes
      }

      response.on("data", (chunk) => {
        const next = activeDownloads.get(modelId)
        if (!next) return
        next.downloadedBytes += chunk.length
        next.progress = next.totalBytes > 0
          ? Math.min(100, Math.round((next.downloadedBytes / next.totalBytes) * 100))
          : null
        sendModelProgress(modelId)
      })

      response.pipe(file)
      file.on("finish", () => {
        file.close(async () => {
          try {
            await fs.rename(tempPath, destination)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
      file.on("error", reject)
    })

    request.on("error", reject)
    request.setTimeout(30000, () => {
      request.destroy(new Error("Download timed out"))
    })
  })
}

function sqlitePath(input) {
  return input.startsWith("sqlite:") ? input.slice("sqlite:".length) : input
}

function getSqlite(dbPath) {
  const resolved = sqlitePath(dbPath)
  if (!sqliteHandles.has(resolved)) {
    fsSync.mkdirSync(path.dirname(resolved), { recursive: true })
    sqliteHandles.set(resolved, new Database(resolved))
  }
  return sqliteHandles.get(resolved)
}

function runtimeMetrics() {
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024
  const availableMemoryGb = os.freemem() / 1024 / 1024 / 1024
  const usedRatio = totalMemoryGb === 0 ? 0 : 1 - availableMemoryGb / totalMemoryGb
  const pressure = usedRatio > 0.82 ? "high" : usedRatio > 0.65 ? "medium" : "low"

  return {
    cpuCount: os.cpus().length,
    cpuUsagePercent: Math.round(os.loadavg()[0] * 100) / 100,
    totalMemoryGb: Math.round(totalMemoryGb * 10) / 10,
    availableMemoryGb: Math.round(availableMemoryGb * 10) / 10,
    pressure,
    recommendedReason: "Electron runtime metrics are estimated from local system resources.",
  }
}

ipcMain.handle("app:get-build-info", () => ({
  appName: app.getName(),
  appVersion: app.getVersion(),
  target: "electron",
  profile: app.isPackaged ? "release" : "debug",
}))

ipcMain.handle("app:get-runtime-metrics", () => runtimeMetrics())
ipcMain.handle("app:get-model-catalog", async () => {
  await fs.mkdir(modelsDir(), { recursive: true })
  return MODEL_CATALOG.map(modelStatus)
})
ipcMain.handle("app:list-llm-models", async () => {
  await fs.mkdir(modelsDir(), { recursive: true })
  const entries = await fs.readdir(modelsDir(), { withFileTypes: true })
  const catalogFiles = new Set(MODEL_CATALOG.flatMap((model) => [model.fileName, ...(model.aliases || [])]))
  const localFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".gguf"))
  return localFiles
    .map((entry) => ({
      id: entry.name,
      name: entry.name.replace(/\.gguf$/i, ""),
      path: path.join(modelsDir(), entry.name),
      managed: catalogFiles.has(entry.name),
    }))
})
ipcMain.handle("app:download-model", async (_event, modelId) => {
  const model = MODEL_CATALOG.find((item) => item.id === modelId)
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
    await downloadFile(model.url, getModelFilePath(model), modelId)
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
})
ipcMain.handle("app:delete-model", async (_event, modelId) => {
  const model = MODEL_CATALOG.find((item) => item.id === modelId)
  if (!model) throw new Error("Unknown model")
  const filePath = findInstalledModelFile(model)
  if (filePath) await fs.rm(filePath, { force: true })
  return modelStatus(model)
})
ipcMain.handle("path:app-data-dir", () => appDataDir())
ipcMain.handle("path:join", (_event, ...parts) => path.join(...parts))

ipcMain.handle("fs:exists", async (_event, targetPath) => fsSync.existsSync(targetPath))
ipcMain.handle("fs:mkdir", async (_event, targetPath, options) => fs.mkdir(targetPath, options))
ipcMain.handle("fs:read-text-file", async (_event, targetPath) => fs.readFile(targetPath, "utf8"))
ipcMain.handle("fs:write-text-file", async (_event, targetPath, content) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, content, "utf8")
})
ipcMain.handle("fs:remove", async (_event, targetPath) => fs.rm(targetPath, { recursive: true, force: true }))
ipcMain.handle("fs:read-dir", async (_event, targetPath) => {
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  }))
})

ipcMain.handle("sqlite:execute", (_event, dbPath, sql, params = []) => {
  const result = getSqlite(dbPath).prepare(sql).run(params)
  return {
    rows: [],
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    changes: result.changes ?? 0,
  }
})

ipcMain.handle("sqlite:select", (_event, dbPath, sql, params = []) => {
  return getSqlite(dbPath).prepare(sql).all(params)
})

app.whenReady().then(async () => {
  await loadElectronLlm({
    getModelPath: (modelAlias) => path.join(modelsDir(), modelAlias),
  })
  startDevServer()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  for (const db of sqliteHandles.values()) db.close()
  if (devServer) devServer.kill()
})
