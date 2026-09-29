import "./chromium-fetch"
import "./core-ipc"

import type { BrowserWindow } from "electron"
import { app, BrowserWindow as BrowserWindowCtor, dialog, ipcMain, Menu } from "electron"

import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { applyAppConfig } from "./app-config-sync"
import { loadAppConfig } from "./app-config"
import { initMainLogger, log } from "./logger"
import * as storagePaths from "./storage-paths"
import { registerCoreIpcHandlers } from "./core-ipc"
import { registerIpcHandlers } from "./ipc-handlers"
import { installCsp } from "./csp"
import type { StoragePaths } from "./types"

const mainDir =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
let mainWindow: BrowserWindow | null = null

function getPaths(): StoragePaths {
  return storagePaths.resolveStoragePaths(app)
}

function appDataDir(): string {
  return getPaths().dataRoot
}

function modelsDir(): string {
  return getPaths().modelsDir
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
}

registerCoreIpcHandlers()
registerIpcHandlers(ipcCtx)

log.info("[main] IPC handlers registered")

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
      log.error(
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

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null)
      await initMainLogger()
      installCsp(app)
      const paths = getPaths()
      await storagePaths.ensureStorageDirs(paths)
      const appConfig = loadAppConfig(app)
      applyAppConfig(app, appConfig)

      await createWindow()
    } catch (error) {
      log.error("[main] startup failed:", error)
      dialog.showErrorBox(
        "Neezy Studio 启动失败",
        error instanceof Error ? error.message : String(error)
      )
      app.quit()
    }

    app.on("activate", () => {
      if (BrowserWindowCtor.getAllWindows().length === 0) {
        createWindow().catch((error) => log.error("[main] createWindow failed:", error))
      }
    })
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
}


