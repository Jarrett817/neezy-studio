/**
 * 释放本地开发常用端口（旧 react-router / electron-vite 未退出时）
 */
import { execSync } from "node:child_process"

const PORTS = [5173, 5174, 5175, 5176, 5177]

function freePortWin(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    })
    const pids = new Set()
    for (const line of out.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed.includes("LISTENING")) continue
      const parts = trimmed.split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid)
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" })
        console.log(`[free-dev-ports] 已结束 PID ${pid}（端口 ${port}）`)
      } catch {
        /* 进程可能已退出 */
      }
    }
  } catch {
    /* 无占用 */
  }
}

function freePortUnix(port) {
  try {
    execSync(`lsof -ti :${port} | xargs -r kill -9`, {
      stdio: "ignore",
      shell: true,
    })
    console.log(`[free-dev-ports] 已释放端口 ${port}`)
  } catch {
    /* 无占用 */
  }
}

for (const port of PORTS) {
  if (process.platform === "win32") freePortWin(port)
  else freePortUnix(port)
}
