import { BrowserWindow } from "electron"

/** 任务列表变更时广播给所有渲染窗口，触发 react-query 刷新 */
export function broadcastTasksChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("tasks:changed")
  }
}
