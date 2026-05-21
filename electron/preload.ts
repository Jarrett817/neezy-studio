import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  getBuildInfo: () => ipcRenderer.invoke("app:get-build-info"),
  getRuntimeMetrics: () => ipcRenderer.invoke("app:get-runtime-metrics"),
  getModelCatalog: (kind?: string) => ipcRenderer.invoke("app:get-model-catalog", kind),
  getModelRecommendations: () => ipcRenderer.invoke("app:get-model-recommendations"),
  loadEmbeddingModel: (modelId: string, preferLowPower?: boolean) =>
    ipcRenderer.invoke("app:load-embedding-model", modelId, preferLowPower),
  unloadEmbeddingModel: () => ipcRenderer.invoke("app:unload-embedding-model"),
  loadChatModel: (payload: unknown) => ipcRenderer.invoke("app:load-chat-model", payload),
  unloadChatModel: () => ipcRenderer.invoke("app:unload-chat-model"),
  resetChatHistory: () => ipcRenderer.invoke("app:reset-chat-history"),
  primeChatHistory: (messages: unknown) =>
    ipcRenderer.invoke("app:prime-chat-history", messages),
  getChatModelStatus: () => ipcRenderer.invoke("app:get-chat-model-status"),
  chatPrompt: (input: string, options?: unknown) =>
    ipcRenderer.invoke("app:chat-prompt", input, options),
  chatPromptStream: (payload: unknown) =>
    ipcRenderer.invoke("app:chat-prompt-stream", payload),
  onChatStream: (handler: (data: unknown) => void) => {
    const listener = (_event: unknown, data: unknown) => handler(data)
    ipcRenderer.on("app:chat-stream", listener as Parameters<typeof ipcRenderer.on>[1])
    return () => ipcRenderer.removeListener("app:chat-stream", listener as Parameters<typeof ipcRenderer.on>[1])
  },
  getChatModelFileInfo: (fileName: string) =>
    ipcRenderer.invoke("app:get-chat-model-file-info", fileName),
  getEmbeddings: (texts: string | string[]) =>
    ipcRenderer.invoke("app:get-embeddings", texts),
  getEmbeddingStatus: () => ipcRenderer.invoke("app:get-embedding-status"),
  listLlmModels: () => ipcRenderer.invoke("app:list-llm-models"),
  downloadModel: (modelId: string) => ipcRenderer.invoke("app:download-model", modelId),
  deleteModel: (modelId: string) => ipcRenderer.invoke("app:delete-model", modelId),
  onModelDownloadProgress: (handler: (item: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on("model-download-progress", listener as Parameters<typeof ipcRenderer.on>[1])
    return () =>
      ipcRenderer.removeListener(
        "model-download-progress",
        listener as Parameters<typeof ipcRenderer.on>[1]
      )
  },
  appDataDir: () => ipcRenderer.invoke("path:app-data-dir"),
  getStoragePaths: () => ipcRenderer.invoke("app:get-storage-paths"),
  saveStoragePaths: (input: { dataRoot: string }) =>
    ipcRenderer.invoke("app:save-storage-paths", input),
  resetStoragePaths: () => ipcRenderer.invoke("app:reset-storage-paths"),
  pickDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke("app:pick-directory", options),
  getMigrationsDir: () => ipcRenderer.invoke("app:get-migrations-dir"),
  join: (...parts: string[]) => ipcRenderer.invoke("path:join", ...parts),
  exists: (targetPath: string) => ipcRenderer.invoke("fs:exists", targetPath),
  mkdir: (targetPath: string, options?: { recursive?: boolean }) =>
    ipcRenderer.invoke("fs:mkdir", targetPath, options),
  readTextFile: (targetPath: string) => ipcRenderer.invoke("fs:read-text-file", targetPath),
  writeTextFile: (targetPath: string, content: string) =>
    ipcRenderer.invoke("fs:write-text-file", targetPath, content),
  remove: (targetPath: string) => ipcRenderer.invoke("fs:remove", targetPath),
  readDir: (targetPath: string) => ipcRenderer.invoke("fs:read-dir", targetPath),
  sqliteExecute: (dbPath: string, sql: string, params?: unknown[]) =>
    ipcRenderer.invoke("sqlite:execute", dbPath, sql, params),
  sqliteSelect: (dbPath: string, sql: string, params?: unknown[]) =>
    ipcRenderer.invoke("sqlite:select", dbPath, sql, params),
  sqliteVecStatus: (dbPath: string) => ipcRenderer.invoke("sqlite:vec-status", dbPath),
  sqliteEnsureVectorSchema: (dbPath: string) =>
    ipcRenderer.invoke("sqlite:ensure-vector-schema", dbPath),
  sqliteVectorUpsertMemory: (dbPath: string, id: string, embedding: number[]) =>
    ipcRenderer.invoke("sqlite:vector-upsert-memory", dbPath, id, embedding),
  sqliteVectorDeleteMemory: (dbPath: string, id: string) =>
    ipcRenderer.invoke("sqlite:vector-delete-memory", dbPath, id),
  sqliteVectorSearchMemories: (dbPath: string, embedding: number[], limit?: number) =>
    ipcRenderer.invoke("sqlite:vector-search-memories", dbPath, embedding, limit),
  sqliteVectorUpsertSlice: (
    dbPath: string,
    id: string,
    content: string,
    sessionId: string | null,
    memoryType: string,
    embedding: number[]
  ) =>
    ipcRenderer.invoke(
      "sqlite:vector-upsert-slice",
      dbPath,
      id,
      content,
      sessionId,
      memoryType,
      embedding
    ),
  sqliteVectorSearchSlices: (
    dbPath: string,
    embedding: number[],
    limit?: number,
    memoryType?: string | null
  ) =>
    ipcRenderer.invoke("sqlite:vector-search-slices", dbPath, embedding, limit, memoryType),
})
