import fs from "node:fs/promises"
import path from "node:path"
import { app } from "electron"

import {
  type ScheduledTask,
  type ScheduledTasksFile,
  SCHEDULED_TASKS_VERSION,
} from "../shared/scheduled-tasks"
import { resolveStoragePaths } from "./storage-paths"

const TASKS_FILE = "scheduled-tasks.json"

function getTasksPath(): string {
  return path.join(resolveStoragePaths(app).dataRoot, TASKS_FILE)
}

async function readRaw(): Promise<ScheduledTasksFile> {
  try {
    const raw = JSON.parse(
      await fs.readFile(getTasksPath(), "utf-8")
    ) as Partial<ScheduledTasksFile>
    return {
      version: SCHEDULED_TASKS_VERSION,
      tasks: Array.isArray(raw.tasks) ? (raw.tasks as ScheduledTask[]) : [],
    }
  } catch {
    return { version: SCHEDULED_TASKS_VERSION, tasks: [] }
  }
}

async function writeRaw(file: ScheduledTasksFile): Promise<void> {
  const tasksPath = getTasksPath()
  await fs.mkdir(path.dirname(tasksPath), { recursive: true })
  await fs.writeFile(tasksPath, JSON.stringify(file, null, 2), "utf-8")
}

export async function loadScheduledTasks(): Promise<ScheduledTask[]> {
  return (await readRaw()).tasks
}

export async function saveScheduledTasks(
  tasks: ScheduledTask[]
): Promise<ScheduledTask[]> {
  await writeRaw({ version: SCHEDULED_TASKS_VERSION, tasks })
  return tasks
}

export async function upsertScheduledTask(
  task: ScheduledTask
): Promise<ScheduledTask[]> {
  const file = await readRaw()
  const idx = file.tasks.findIndex((t) => t.id === task.id)
  if (idx >= 0) file.tasks[idx] = task
  else file.tasks.push(task)
  await writeRaw(file)
  return file.tasks
}

export async function removeScheduledTask(
  id: string
): Promise<ScheduledTask[]> {
  const file = await readRaw()
  file.tasks = file.tasks.filter((t) => t.id !== id)
  await writeRaw(file)
  return file.tasks
}

export interface TaskStatusPatch {
  lastRunAt?: number
  lastStatus?: ScheduledTask["lastStatus"]
  lastError?: string
  lastSessionId?: string
}

export async function patchTaskStatus(
  id: string,
  patch: TaskStatusPatch
): Promise<ScheduledTask[]> {
  const file = await readRaw()
  const task = file.tasks.find((t) => t.id === id)
  if (task) Object.assign(task, patch)
  await writeRaw(file)
  return file.tasks
}

/** 启动时清理上次未完成的 running 状态（应用可能在上次任务执行中退出） */
export async function resetStaleRunning(): Promise<void> {
  const file = await readRaw()
  let dirty = false
  for (const t of file.tasks) {
    if (t.lastStatus === "running") {
      t.lastStatus = "error"
      t.lastError = "应用重启时任务被中断"
      dirty = true
    }
  }
  if (dirty) await writeRaw(file)
}
