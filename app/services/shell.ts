// Ollama 进程管理 - 通过 Rust Tauri 命令控制

import { invokeTauri } from "~/services/tauri-client"

export type DownloadProgress = {
  status: "idle" | "downloading" | "extracting" | "completed" | "error"
  progress: number
  error?: string
}

export async function downloadOllama(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  onProgress?.({ status: "completed", progress: 100 })
}

export async function startOllama(): Promise<void> {
  console.log("[shell] 启动 Ollama via Rust...")
  await invokeTauri("start_ollama")
  console.log("[shell] Ollama 启动命令已发送")
}

export async function stopOllama(): Promise<void> {
  console.log("[shell] 停止 Ollama...")
  await invokeTauri("stop_ollama")
  console.log("[shell] Ollama 停止命令已发送")
}

export async function isOllamaInstalled(): Promise<boolean> {
  return true
}

export async function isOllamaRunning(): Promise<boolean> {
  return invokeTauri<boolean>("is_ollama_running")
}

export async function ensureOllamaRunning(): Promise<void> {
  await startOllama()
}
