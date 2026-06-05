import { app, ipcMain } from "electron"

import { applyAppConfig } from "./app-config-sync"
import { loadAppConfig, saveAppConfig } from "./app-config"
import type { AppConfig } from "../shared/app-config"
import { listOpenAiCompatibleModels } from "./openai-models"
import { syncRuntimeSettings, type RuntimeSettings } from "./runtime-settings"

/** 尽早注册，避免主进程重载或启动顺序导致 renderer 调用时 handler 未就绪 */
function registerCoreIpcHandlers(): void {
  ipcMain.removeHandler("app:sync-runtime-settings")
  ipcMain.removeHandler("app:list-openai-models")
  ipcMain.removeHandler("app:get-app-config")
  ipcMain.removeHandler("app:save-app-config")

  ipcMain.handle("app:sync-runtime-settings", (_event, settings: RuntimeSettings) => {
    syncRuntimeSettings(settings)
  })

  ipcMain.handle("app:list-openai-models", (_event, payload: unknown) => {
    const body =
      payload && typeof payload === "object"
        ? (payload as { baseUrl?: string; apiKey?: string })
        : {}
    return listOpenAiCompatibleModels(body.baseUrl ?? "", body.apiKey ?? "")
  })

  ipcMain.handle("app:get-app-config", () => loadAppConfig(app))

  ipcMain.handle("app:save-app-config", async (_event, input: AppConfig) => {
    const saved = await saveAppConfig(app, input)
    return applyAppConfig(app, saved)
  })
}

registerCoreIpcHandlers()

export { registerCoreIpcHandlers }
