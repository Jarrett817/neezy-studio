import { ipcMain } from "electron"

import { resetOllamaClient } from "./ollama/client"
import { configureOllamaHost } from "./ollama/env"
import { syncRuntimeSettings, type RuntimeSettings } from "./runtime-settings"

/** 尽早注册，避免主进程重载或启动顺序导致 renderer 调用时 handler 未就绪 */
function registerCoreIpcHandlers(): void {
  ipcMain.removeHandler("app:configure-ollama-host")
  ipcMain.removeHandler("app:sync-runtime-settings")

  ipcMain.handle("app:configure-ollama-host", (_event, host: string) => {
    configureOllamaHost(typeof host === "string" ? host : "")
    resetOllamaClient()
  })

  ipcMain.handle("app:sync-runtime-settings", (_event, settings: RuntimeSettings) => {
    syncRuntimeSettings(settings)
  })
}

registerCoreIpcHandlers()

export { registerCoreIpcHandlers }
