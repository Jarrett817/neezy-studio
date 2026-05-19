const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  getBuildInfo: () => ipcRenderer.invoke("app:get-build-info"),
  getRuntimeMetrics: () => ipcRenderer.invoke("app:get-runtime-metrics"),
  getModelCatalog: () => ipcRenderer.invoke("app:get-model-catalog"),
  listLlmModels: () => ipcRenderer.invoke("app:list-llm-models"),
  downloadModel: (modelId) => ipcRenderer.invoke("app:download-model", modelId),
  deleteModel: (modelId) => ipcRenderer.invoke("app:delete-model", modelId),
  onModelDownloadProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on("model-download-progress", listener)
    return () => ipcRenderer.removeListener("model-download-progress", listener)
  },
  appDataDir: () => ipcRenderer.invoke("path:app-data-dir"),
  join: (...parts) => ipcRenderer.invoke("path:join", ...parts),
  exists: (path) => ipcRenderer.invoke("fs:exists", path),
  mkdir: (path, options) => ipcRenderer.invoke("fs:mkdir", path, options),
  readTextFile: (path) => ipcRenderer.invoke("fs:read-text-file", path),
  writeTextFile: (path, content) => ipcRenderer.invoke("fs:write-text-file", path, content),
  remove: (path) => ipcRenderer.invoke("fs:remove", path),
  readDir: (path) => ipcRenderer.invoke("fs:read-dir", path),
  sqliteExecute: (dbPath, sql, params) => ipcRenderer.invoke("sqlite:execute", dbPath, sql, params),
  sqliteSelect: (dbPath, sql, params) => ipcRenderer.invoke("sqlite:select", dbPath, sql, params),
})
