import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"

import { getOllamaClient } from "./client"
import { buildOllamaProcessEnv, getConfiguredOllamaModelsDir } from "./env"

const execFileAsync = promisify(execFile)

let serveChild: ReturnType<typeof spawn> | null = null
/** 仅当本应用 spawn 了 ollama serve 时为 true；外部托盘/服务已运行时保持 false */
let serveSpawnedByApp = false
let ollamaReady = false

export function isOllamaReady(): boolean {
  return ollamaReady
}

export async function pingOllama(timeoutMs = 3000): Promise<boolean> {
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    await getOllamaClient().version()
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

export async function findOllamaBinary(): Promise<string | null> {
  const cmd = process.platform === "win32" ? "where" : "which"
  try {
    const { stdout } = await execFileAsync(cmd, ["ollama"], {
      timeout: 8000,
      windowsHide: true,
    })
    const line = stdout.trim().split(/\r?\n/)[0]?.trim()
    return line || null
  } catch {
    return null
  }
}

async function startOllamaServe(binary: string): Promise<void> {
  if (serveChild && !serveChild.killed) return
  serveChild = spawn(binary, ["serve"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
    windowsHide: true,
  })
  serveSpawnedByApp = true
  serveChild.unref?.()
}

async function installOllama(): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync(
      "winget",
      [
        "install",
        "-e",
        "--id",
        "Ollama.Ollama",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      { timeout: 600_000, windowsHide: true }
    )
    return
  }
  if (process.platform === "darwin") {
    try {
      await execFileAsync("brew", ["install", "ollama"], { timeout: 600_000 })
      return
    } catch {
      throw new Error("请从 https://ollama.com/download 安装 Ollama（或先安装 Homebrew）")
    }
  }
  await execFileAsync("sh", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
    timeout: 600_000,
  })
}

async function waitForOllamaReady(timeoutMs = 120_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await pingOllama(2000)) return
    await new Promise((r) => setTimeout(r, 800))
  }
  throw new Error("Ollama 服务未在预期时间内就绪")
}

/** 等待外部已启动的 Ollama（托盘/系统服务），避免重复 ollama serve */
async function waitForExistingOllama(
  attempts = 20,
  intervalMs = 500
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await pingOllama(2000)) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

/** 对话热路径：已就绪则不再 ping */
export async function ensureOllamaReady(): Promise<void> {
  if (ollamaReady) return
  await ensureOllama()
}

/** 检测 → 已运行则直接返回 → 否则安装/本进程 serve → 等待就绪 */
export async function ensureOllama(): Promise<void> {
  if (ollamaReady) return
  if (await pingOllama()) {
    ollamaReady = true
    return
  }

  if (await waitForExistingOllama()) {
    ollamaReady = true
    const modelsDir = getConfiguredOllamaModelsDir()
    console.info("[ollama] 检测到已运行的 Ollama 服务（外部进程，未改写其模型目录）")
    if (modelsDir) {
      console.info(
        `[ollama] 本应用期望模型目录：${modelsDir}；若 pull 落盘位置不对，请退出托盘 Ollama 后重启本应用，或设置系统环境变量 OLLAMA_MODELS`
      )
    }
    return
  }

  let binary = await findOllamaBinary()
  if (!binary) {
    console.info("[ollama] 未检测到 Ollama，开始安装…")
    await installOllama()
    binary = await findOllamaBinary()
    if (!binary) {
      throw new Error("Ollama 安装后仍未找到可执行文件，请重启应用或手动安装")
    }
  }

  if (!(await pingOllama(1500))) {
    if (!serveSpawnedByApp) {
      console.info("[ollama] 启动 ollama serve…")
      await startOllamaServe(binary)
    }
  }

  await waitForOllamaReady()
  ollamaReady = true
  console.info("[ollama] API 已就绪")
}
