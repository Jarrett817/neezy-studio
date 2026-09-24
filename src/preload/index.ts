import { contextBridge, ipcRenderer, webUtils } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  getBuildInfo: () => ipcRenderer.invoke("app:get-build-info"),
  getPlaywrightBrowserStatus: () => ipcRenderer.invoke("app:get-playwright-browser-status"),
  ensurePlaywrightBrowser: () => ipcRenderer.invoke("app:ensure-playwright-browser"),
  syncRuntimeSettings: (settings: unknown) =>
    ipcRenderer.invoke("app:sync-runtime-settings", settings),
  getAppConfig: () => ipcRenderer.invoke("app:get-app-config"),
  saveAppConfig: (config: unknown) => ipcRenderer.invoke("app:save-app-config", config),
  testLlmConnection: () => ipcRenderer.invoke("app:test-llm-connection"),
  listOpenAiModels: (payload: { baseUrl: string; apiKey: string }) =>
    ipcRenderer.invoke("app:list-openai-models", payload),
  appDataDir: () => ipcRenderer.invoke("path:app-data-dir"),
  getStoragePaths: () => ipcRenderer.invoke("app:get-storage-paths"),
  saveStoragePaths: (input: { dataRoot: string }) =>
    ipcRenderer.invoke("app:save-storage-paths", input),
  resetStoragePaths: () => ipcRenderer.invoke("app:reset-storage-paths"),
  pickDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke("app:pick-directory", options),
  pickDocuments: () => ipcRenderer.invoke("app:pick-documents"),
  ingestDocument: (filePath: string) =>
    ipcRenderer.invoke("knowledge:ingest-document", filePath),
  join: (...parts: string[]) => ipcRenderer.invoke("path:join", ...parts),
  exists: (targetPath: string) => ipcRenderer.invoke("fs:exists", targetPath),
  mkdir: (targetPath: string, options?: { recursive?: boolean }) =>
    ipcRenderer.invoke("fs:mkdir", targetPath, options),
  readTextFile: (targetPath: string) => ipcRenderer.invoke("fs:read-text-file", targetPath),
  writeTextFile: (targetPath: string, content: string) =>
    ipcRenderer.invoke("fs:write-text-file", targetPath, content),
  remove: (targetPath: string) => ipcRenderer.invoke("fs:remove", targetPath),
  readDir: (targetPath: string) => ipcRenderer.invoke("fs:read-dir", targetPath),
  getAgentPermissionSettings: () =>
    ipcRenderer.invoke("app:get-agent-permission-settings"),
  saveAgentPermissionSettings: (input: unknown) =>
    ipcRenderer.invoke("app:save-agent-permission-settings", input),
  resetAgentPermissionSettings: () =>
    ipcRenderer.invoke("app:reset-agent-permission-settings"),
  skillsListInstalled: () => ipcRenderer.invoke("skills:list-installed"),
  skillsUninstall: (installKey: string) =>
    ipcRenderer.invoke("skills:uninstall", { installKey }),
  skillsImportFromPath: (sourcePath: string) =>
    ipcRenderer.invoke("skills:import-from-path", { sourcePath }),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  invoke: <T = unknown>(channel: string, data?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, data),
  on: <T = unknown>(
    channel: string,
    handler: (event: unknown, data: T) => void
  ) => {
    const listener = (_event: unknown, data: T) => handler(_event, data)
    ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    return () => ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.on>[1])
  },
})
