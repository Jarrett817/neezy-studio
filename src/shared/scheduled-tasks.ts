export type ScheduleType = "interval" | "daily" | "weekly"

export interface TaskSchedule {
  type: ScheduleType
  /** interval：间隔分钟数（1~10080） */
  minutes?: number
  /** daily/weekly：24h "HH:MM" */
  time?: string
  /** weekly：0~6，0=周日 */
  weekday?: number
}

export type TaskRunStatus = "running" | "success" | "error"

export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  systemPrompt?: string
  schedule: TaskSchedule
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastStatus?: TaskRunStatus
  lastError?: string
  /** 上次触发落盘的 Pi 磁盘会话 id，便于跳转查看结果 */
  lastSessionId?: string
}

export interface ScheduledTasksFile {
  version: number
  tasks: ScheduledTask[]
}

export const SCHEDULED_TASKS_VERSION = 1

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function newTaskId(): string {
  return crypto.randomUUID()
}

export function normalizeTaskName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function isValidTaskName(name: string): boolean {
  return name.length >= 1 && name.length <= 40
}

export function validateSchedule(schedule: TaskSchedule): string | null {
  if (schedule.type === "interval") {
    const m = Number(schedule.minutes)
    if (!Number.isFinite(m) || m < 1 || m > 10080) {
      return "间隔分钟数需在 1~10080 之间"
    }
    return null
  }
  if (["daily", "weekly"].includes(schedule.type)) {
    if (!schedule.time || !TIME_RE.test(schedule.time)) {
      return "时间格式应为 HH:MM（如 09:30）"
    }
    if (schedule.type === "weekly") {
      const w = Number(schedule.weekday)
      if (!Number.isFinite(w) || w < 0 || w > 6) {
        return "星期需在 0~6（0=周日）"
      }
    }
    return null
  }
  return "未知调度类型"
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

export function describeSchedule(schedule: TaskSchedule): string {
  if (schedule.type === "interval") {
    const m = Number(schedule.minutes)
    if (m < 60) return `每 ${m} 分钟`
    if (m % 60 === 0) return `每 ${m / 60} 小时`
    const h = Math.floor(m / 60)
    const rest = m % 60
    return `每 ${h} 小时 ${rest} 分`
  }
  if (schedule.type === "daily") return `每天 ${schedule.time}`
  if (schedule.type === "weekly") {
    return `每${WEEKDAY_NAMES[Number(schedule.weekday)] ?? "?"} ${schedule.time}`
  }
  return "未知"
}

export function describeStatus(task: ScheduledTask): string {
  switch (task.lastStatus) {
    case "running":
      return "运行中"
    case "success":
      return task.lastRunAt
        ? `成功 · ${new Date(task.lastRunAt).toLocaleString("zh-CN")}`
        : "成功"
    case "error":
      return task.lastRunAt
        ? `失败 · ${new Date(task.lastRunAt).toLocaleString("zh-CN")}`
        : "失败"
    default:
      return "未运行"
  }
}
