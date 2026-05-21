const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  getBuildInfo: () => ipcRenderer.invoke("app:get-build-info"),
  getRuntimeMetrics: () => ipcRenderer.invoke("app:get-runtime-metrics"),
  getModelCatalog: (kind) => ipcRenderer.invoke("app:get-model-catalog", kind),
  getModelRecommendations: () => ipcRenderer.invoke("app:get-model-recommendations"),
  loadEmbeddingModel: (modelId) => ipcRenderer.invoke("app:load-embedding-model", modelId),
  unloadEmbeddingModel: () => ipcRenderer.invoke("app:unload-embedding-model"),
  getChatModelFileInfo: (fileName) =>
    ipcRenderer.invoke("app:get-chat-model-file-info", fileName),
  getEmbeddings: (texts) => ipcRenderer.invoke("app:get-embeddings", texts),
  getEmbeddingStatus: () => ipcRenderer.invoke("app:get-embedding-status"),
  listLlmModels: () => ipcRenderer.invoke("app:list-llm-models"),
  downloadModel: (modelId) => ipcRenderer.invoke("app:download-model", modelId),
  deleteModel: (modelId) => ipcRenderer.invoke("app:delete-model", modelId),
  onModelDownloadProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on("model-download-progress", listener)
    return () => ipcRenderer.removeListener("model-download-progress", listener)
  },
  appDataDir: () => ipcRenderer.invoke("path:app-data-dir"),
  getStoragePaths: () => ipcRenderer.invoke("app:get-storage-paths"),
  saveStoragePaths: (input) => ipcRenderer.invoke("app:save-storage-paths", input),
  resetStoragePaths: () => ipcRenderer.invoke("app:reset-storage-paths"),
  pickDirectory: (options) => ipcRenderer.invoke("app:pick-directory", options),
  getMigrationsDir: () => ipcRenderer.invoke("app:get-migrations-dir"),
  join: (...parts) => ipcRenderer.invoke("path:join", ...parts),
  exists: (path) => ipcRenderer.invoke("fs:exists", path),
  mkdir: (path, options) => ipcRenderer.invoke("fs:mkdir", path, options),
  readTextFile: (path) => ipcRenderer.invoke("fs:read-text-file", path),
  writeTextFile: (path, content) => ipcRenderer.invoke("fs:write-text-file", path, content),
  remove: (path) => ipcRenderer.invoke("fs:remove", path),
  readDir: (path) => ipcRenderer.invoke("fs:read-dir", path),
  sqliteExecute: (dbPath, sql, params) => ipcRenderer.invoke("sqlite:execute", dbPath, sql, params),
  sqliteSelect: (dbPath, sql, params) => ipcRenderer.invoke("sqlite:select", dbPath, sql, params),
  sqliteVecStatus: (dbPath) => ipcRenderer.invoke("sqlite:vec-status", dbPath),
  sqliteEnsureVectorSchema: (dbPath) =>
    ipcRenderer.invoke("sqlite:ensure-vector-schema", dbPath),
  sqliteVectorUpsertMemory: (dbPath, id, embedding) =>
    ipcRenderer.invoke("sqlite:vector-upsert-memory", dbPath, id, embedding),
  sqliteVectorDeleteMemory: (dbPath, id) =>
    ipcRenderer.invoke("sqlite:vector-delete-memory", dbPath, id),
  sqliteVectorSearchMemories: (dbPath, embedding, limit) =>
    ipcRenderer.invoke("sqlite:vector-search-memories", dbPath, embedding, limit),
  sqliteVectorUpsertSlice: (dbPath, id, content, sessionId, memoryType, embedding) =>
    ipcRenderer.invoke(
      "sqlite:vector-upsert-slice",
      dbPath,
      id,
      content,
      sessionId,
      memoryType,
      embedding
    ),
  sqliteVectorSearchSlices: (dbPath, embedding, limit, memoryType) =>
    ipcRenderer.invoke(
      "sqlite:vector-search-slices",
      dbPath,
      embedding,
      limit,
      memoryType
    ),
})
