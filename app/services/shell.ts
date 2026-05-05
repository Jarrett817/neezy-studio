// Ollama 进程管理 - 前端 via tauri-plugin-shell

import { Command } from "@tauri-apps/plugin-shell"
import { isOllamaRunning } from "./ollama"

// 启动 Ollama
export async function startOllama(): Promise<void> {
  try {
    // 尝试全局 ollama 命令
    const command = Command.create("ollama", ["serve"])
    await command.spawn()
    console.log("Ollama 进程已启动")
  } catch (error) {
    console.error("启动 Ollama 失败:", error)
    throw error
  }
}

// 停止 Ollama（通过 HTTP API 或进程）
export async function stopOllama(): Promise<void> {
  try {
    // Ollama 不提供官方的 stop API，直接结束进程
    // 由于是子进程，可以通过发送信号终止
    const command = Command.create("taskkill", ["/IM", "ollama.exe", "/F"])
    await command.spawn()
    console.log("Ollama 进程已停止")
  } catch (error) {
    // 忽略错误（进程可能已经停止）
    console.log("停止 Ollama:", error)
  }
}

// 确保 Ollama 运行
export async function ensureOllamaRunning(): Promise<void> {
  const running = await isOllamaRunning()
  if (!running) {
    await startOllama()
    // 等待 Ollama 启动
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (await isOllamaRunning()) {
        return
      }
    }
    throw new Error("Ollama 启动失败")
  }
}
