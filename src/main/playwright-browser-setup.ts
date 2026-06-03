import { app } from "electron"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { log } from "./logger"

const nodeRequire = createRequire(import.meta.url)

export type PlaywrightBrowserState = "ready" | "missing" | "installing" | "error"

export interface PlaywrightBrowserStatus {
  state: PlaywrightBrowserState
  browsersDir: string
  message?: string
}

let browsersDir = ""
let installPromise: Promise<PlaywrightBrowserStatus> | null = null
let lastStatus: PlaywrightBrowserStatus = {
  state: "missing",
  browsersDir: "",
}

/** 须在首次 import playwright 之前调用（pi-textbrowser 加载前）。 */
export function applyPlaywrightBrowsersPath(): string {
  if (!app.isReady()) {
    throw new Error("applyPlaywrightBrowsersPath 须在 app.whenReady 之后调用")
  }
  browsersDir = path.join(app.getPath("userData"), "playwright-browsers")
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir
  lastStatus = { ...lastStatus, browsersDir }
  return browsersDir
}

function resolvePlaywrightCli(): string {
  const pkgJson = nodeRequire.resolve("playwright/package.json")
  return path.join(path.dirname(pkgJson), "cli.js")
}

async function probeChromiumExecutable(): Promise<boolean> {
  applyPlaywrightBrowsersPath()
  try {
    const { chromium } = await import("playwright")
    const exe = chromium.executablePath()
    return typeof exe === "string" && exe.length > 0 && existsSync(exe)
  } catch {
    return false
  }
}

function runPlaywrightInstall(): Promise<void> {
  applyPlaywrightBrowsersPath()
  const cli = resolvePlaywrightCli()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `playwright install 退出码 ${code ?? "unknown"}`))
    })
  })
}

export function getPlaywrightBrowserStatus(): PlaywrightBrowserStatus {
  return { ...lastStatus, browsersDir: browsersDir || applyPlaywrightBrowsersPath() }
}

/** 检测并下载 Chromium 到 userData/playwright-browsers（幂等）。 */
export async function ensurePlaywrightChromium(): Promise<PlaywrightBrowserStatus> {
  applyPlaywrightBrowsersPath()
  if (lastStatus.state === "ready") {
    if (await probeChromiumExecutable()) return getPlaywrightBrowserStatus()
    lastStatus = { state: "missing", browsersDir }
  }
  if (installPromise) return installPromise

  if (await probeChromiumExecutable()) {
    lastStatus = { state: "ready", browsersDir }
    return getPlaywrightBrowserStatus()
  }

  installPromise = (async (): Promise<PlaywrightBrowserStatus> => {
    lastStatus = { state: "installing", browsersDir }
    log.info("[playwright] 正在下载 Chromium（首次使用网页自动化，约 150MB）…")
    try {
      await runPlaywrightInstall()
      if (!(await probeChromiumExecutable())) {
        throw new Error("Chromium 安装完成但未检测到可执行文件")
      }
      lastStatus = { state: "ready", browsersDir }
      log.info("[playwright] Chromium 已就绪:", browsersDir)
      return getPlaywrightBrowserStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastStatus = { state: "error", browsersDir, message }
      log.error("[playwright] Chromium 安装失败:", message)
      return getPlaywrightBrowserStatus()
    } finally {
      installPromise = null
    }
  })()

  return installPromise
}
