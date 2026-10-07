import { type BrowserWindow, Notification } from "electron"

import type { ScheduledTask, TaskSchedule } from "../shared/scheduled-tasks"
import { log } from "./logger"
import { createAgentSession, promptAgent, renameAgentSession } from "./pi-agent"
import {
  loadScheduledTasks,
  patchTaskStatus,
  resetStaleRunning,
} from "./scheduled-tasks-store"
import { broadcastTasksChanged } from "./tasks-broadcast"

let tickTimer: NodeJS.Timeout | null = null
let getMainWindow: (() => BrowserWindow | null) | null = null

function nowHHMM(d = new Date()): string {
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

function isSameDay(ts: number, d = new Date()): boolean {
  const t = new Date(ts)
  return (
    t.getFullYear() === d.getFullYear() &&
    t.getMonth() === d.getMonth() &&
    t.getDate() === d.getDate()
  )
}

function shouldRun(task: ScheduledTask, now = new Date()): boolean {
  const s: TaskSchedule = task.schedule
  if (s.type === "interval") {
    const minutes = Number(s.minutes)
    if (!task.lastRunAt) return true
    return now.getTime() - task.lastRunAt >= minutes * 60_000
  }
  if (["daily", "weekly"].includes(s.type)) {
    if (nowHHMM(now) !== s.time) return false
    if (s.type === "weekly" && now.getDay() !== Number(s.weekday)) return false
    if (task.lastRunAt && isSameDay(task.lastRunAt, now)) return false
    return true
  }
  return false
}

function notify(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    new Notification({ title, body }).show()
  } catch (err) {
    log.warn("[scheduler] notify failed:", err)
  }
}

async function runTask(task: ScheduledTask): Promise<void> {
  const window = getMainWindow?.()
  if (!window || window.isDestroyed()) {
    log.warn("[scheduler] 无可用主窗口，跳过任务:", task.name)
    return
  }
  log.info("[scheduler] run task:", task.name)
  await patchTaskStatus(task.id, {
    lastStatus: "running",
    lastError: undefined,
  })
  broadcastTasksChanged()
  try {
    const diskSessionId = await createAgentSession(window, { createNew: true })
    await renameAgentSession(diskSessionId, task.name)
    await patchTaskStatus(task.id, { lastSessionId: diskSessionId })
    broadcastTasksChanged()
    const prompt = [task.systemPrompt?.trim(), task.prompt]
      .filter(Boolean)
      .join("\n\n")
    await promptAgent(diskSessionId, prompt)
    if (!window.isDestroyed()) {
      window.webContents.send("tasks:session-complete", {
        sessionId: diskSessionId,
      })
    }
    await patchTaskStatus(task.id, {
      lastStatus: "success",
      lastRunAt: Date.now(),
      lastError: undefined,
    })
    notify(`定时任务完成：${task.name}`, "可在「对话」中查看结果")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error("[scheduler] task failed:", task.name, msg)
    await patchTaskStatus(task.id, {
      lastStatus: "error",
      lastRunAt: Date.now(),
      lastError: msg,
    })
    notify(`定时任务失败：${task.name}`, msg)
  }
  broadcastTasksChanged()
}

async function tick(): Promise<void> {
  try {
    const tasks = await loadScheduledTasks()
    for (const task of tasks) {
      if (!task.enabled || task.lastStatus === "running") continue
      if (shouldRun(task)) void runTask(task)
    }
  } catch (err) {
    log.error("[scheduler] tick failed:", err)
  }
}

export function startScheduler(opts: {
  getMainWindow: () => BrowserWindow | null
}): void {
  getMainWindow = opts.getMainWindow
  if (tickTimer) clearInterval(tickTimer)
  void resetStaleRunning().finally(() => {
    void tick()
    tickTimer = setInterval(() => void tick(), 60_000)
  })
}

export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

export async function runTaskNow(taskId: string): Promise<void> {
  const tasks = await loadScheduledTasks()
  const task = tasks.find((t) => t.id === taskId)
  if (!task) throw new Error("任务不存在")
  await runTask(task)
}
