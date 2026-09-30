import type { ScheduledTask } from "../../../shared/scheduled-tasks"
import { getElectronApi } from "./electron-client"

export type { ScheduledTask }

export function listScheduledTasks(): Promise<ScheduledTask[]> {
  return getElectronApi().tasksList()
}

export function upsertScheduledTask(
  task: ScheduledTask
): Promise<ScheduledTask[]> {
  return getElectronApi().tasksUpsert(task)
}

export function removeScheduledTask(id: string): Promise<ScheduledTask[]> {
  return getElectronApi().tasksRemove(id)
}

export function runTaskNow(id: string): Promise<void> {
  return getElectronApi().tasksRunNow(id)
}

export function subscribeTasksChanged(handler: () => void): () => void {
  return getElectronApi().onTasksChanged(handler)
}
