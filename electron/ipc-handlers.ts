import {
  messagesToChatHistory,
  primeChatHistory,
  runChatPromptStream,
} from "./ollama/chat-runtime"
import type { IpcContext } from "./types"

function vecErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined
}

/** 尽早注册 IPC，避免主进程顶部 native 模块加载失败时 handler 未注册。 */
export function registerIpcHandlers(ctx: IpcContext): void {
  const { ipcMain, app, dialog, storagePaths } = ctx

  ipcMain.handle("app:get-build-info", () => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    target: "electron",
    profile: app.isPackaged ? "release" : "debug",
  }))

  ipcMain.handle("app:get-storage-paths", () => ctx.getPaths())
  ipcMain.handle("app:save-storage-paths", async (_event, input) => {
    ctx.closeAllSqliteHandles()
    storagePaths.invalidateStoragePathsCache()
    ctx.invalidateModelScanCache?.()
    const paths = storagePaths.saveStoragePaths(app, input)
    ctx.syncOllamaStorageEnv()
    return paths
  })
  ipcMain.handle("app:reset-storage-paths", async () => {
    ctx.closeAllSqliteHandles()
    ctx.invalidateModelScanCache?.()
    const paths = storagePaths.resetStoragePaths(app)
    ctx.syncOllamaStorageEnv()
    return paths
  })
  ipcMain.handle("app:pick-directory", async (_event, options: { title?: string; defaultPath?: string } = {}) => {
    const result = await dialog.showOpenDialog(ctx.mainWindow ?? (undefined as never), {
      properties: ["openDirectory", "createDirectory"],
      title: options.title ?? "选择文件夹",
      defaultPath: options.defaultPath,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle("path:app-data-dir", () => ctx.appDataDir())
  ipcMain.handle("path:join", (_event, ...parts: string[]) => ctx.path.join(...parts))
  ipcMain.handle("app:get-migrations-dir", () => ctx.path.join(__dirname, "..", "drizzle"))

  ipcMain.handle("fs:exists", async (_event, targetPath: string) =>
    ctx.fsSync.existsSync(targetPath)
  )
  ipcMain.handle("fs:mkdir", async (_event, targetPath: string, options?: { recursive?: boolean }) =>
    ctx.fs.mkdir(targetPath, options)
  )
  ipcMain.handle("fs:read-text-file", async (_event, targetPath: string) =>
    ctx.fs.readFile(targetPath, "utf8")
  )
  ipcMain.handle("fs:write-text-file", async (_event, targetPath: string, content: string) => {
    await ctx.fs.mkdir(ctx.path.dirname(targetPath), { recursive: true })
    await ctx.fs.writeFile(targetPath, content, "utf8")
  })
  ipcMain.handle("fs:remove", async (_event, targetPath: string) =>
    ctx.fs.rm(targetPath, { recursive: true, force: true })
  )
  ipcMain.handle("fs:read-dir", async (_event, targetPath: string) => {
    const entries = await ctx.fs.readdir(targetPath, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }))
  })

  ipcMain.handle("app:get-runtime-metrics", () => ctx.runtimeMetrics())
  ipcMain.handle("app:get-model-recommendations", () => ctx.runtimeMetrics())
  ipcMain.handle("app:get-model-catalog", (_event, kind?: import("./types").ModelKind) =>
    ctx.getModelCatalog(kind)
  )
  ipcMain.handle("app:rebuild-model-catalog", () => ctx.refreshModelCatalog())
  ipcMain.handle("app:list-llm-models", async () => {
    const catalog = await ctx.getModelCatalog("chat")
    return catalog
      .filter((m) => m.installed)
      .map((m) => ({
        id: m.fileName,
        name: m.title,
        path: m.fileName,
        managed: true,
      }))
  })
  ipcMain.handle("app:download-model", async (_event, modelId: string) => ctx.downloadModel(modelId))
  ipcMain.handle("app:cancel-model-download", (_event, modelId: string) =>
    ctx.cancelModelDownload(modelId)
  )
  ipcMain.handle("app:delete-model", async (_event, modelId: string) => ctx.deleteModel(modelId))
  ipcMain.handle("app:load-embedding-model", async (_event, modelId: string, preferLowPower?: boolean) =>
    ctx.loadEmbeddingModel(modelId, Boolean(preferLowPower))
  )
  ipcMain.handle("app:unload-embedding-model", () => ctx.unloadEmbeddingModel())
  ipcMain.handle("app:load-chat-model", async (_event, payload) => ctx.loadChatModel(payload))
  ipcMain.handle("app:unload-chat-model", () => ctx.unloadChatModel())
  ipcMain.handle("app:reset-chat-history", () => ctx.resetChatHistory())
  ipcMain.handle(
    "app:prime-chat-history",
    (
      _event,
      messages: { role: "system" | "user" | "assistant"; content: string }[]
    ) => {
      primeChatHistory(messagesToChatHistory(messages))
    }
  )
  ipcMain.handle("app:get-chat-model-status", () => ctx.getChatModelStatus())
  ipcMain.handle("app:chat-prompt", async (_event, input: string, options) =>
    ctx.chatPrompt(input, options)
  )
  ipcMain.handle("app:chat-prompt-stream", async (event, payload) => {
    const { requestId, input, primeMessages, temperature, topK, maxTokens, useFunctions } =
      payload as {
        requestId: string
        input: string
        primeMessages?: { role: "system" | "user" | "assistant"; content: string }[]
        temperature?: number
        topK?: number
        maxTokens?: number
        useFunctions?: boolean
      }
    try {
      event.sender.send("app:chat-stream", { requestId, type: "start" })
      if (primeMessages?.length) {
        primeChatHistory(messagesToChatHistory(primeMessages))
      }

      await runChatPromptStream(
        input,
        { temperature, topK, maxTokens, useFunctions },
        ({ segment, delta }) => {
          if (!delta) return
          event.sender.send("app:chat-stream", {
            requestId,
            type: "chunk",
            segment,
            delta,
          })
        }
      )
      event.sender.send("app:chat-stream", { requestId, type: "done", content: "" })
    } catch (error) {
      event.sender.send("app:chat-stream", {
        requestId,
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  ipcMain.handle("app:get-chat-model-file-info", (_event, fileName: string) =>
    ctx.getChatModelFileInfo(fileName)
  )
  ipcMain.handle("app:get-embeddings", async (_event, texts: string | string[]) =>
    ctx.embedTexts(texts)
  )
  ipcMain.handle("app:get-embedding-status", () => ctx.getEmbeddingStatus())

  ipcMain.handle("sqlite:vec-status", (_event, dbPath: string) => {
    ctx.getSqlite(dbPath)
    return ctx.sqliteRuntime.getVecStatus(dbPath)
  })
  ipcMain.handle("sqlite:ensure-vector-schema", (_event, dbPath: string) => {
    ctx.getSqlite(dbPath)
    return ctx.sqliteRuntime.ensureVectorSchema(dbPath)
  })
  ipcMain.handle(
    "sqlite:vector-upsert-memory",
    (_event, dbPath: string, id: string, embedding: number[]) => {
      const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
      if (vecLoaded) {
        ctx.sqliteRuntime.runStatement(
          dbPath,
          `INSERT OR REPLACE INTO memory_embeddings (id, embedding) VALUES (?, ?)`,
          [id, embedding]
        )
        return { mode: "vec0" as const }
      }
      ctx.sqliteRuntime.vectorFallback.upsertMemoryEmbedding(db as never, id, embedding)
      return { mode: "fallback" as const }
    }
  )
  ipcMain.handle("sqlite:vector-delete-memory", (_event, dbPath: string, id: string) => {
    const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
    if (vecLoaded) {
      ctx.sqliteRuntime.runStatement(dbPath, `DELETE FROM memory_embeddings WHERE id = ?`, [id])
      return { mode: "vec0" as const }
    }
    ctx.sqliteRuntime.vectorFallback.deleteMemoryEmbedding(db as never, id)
    return { mode: "fallback" as const }
  })
  ipcMain.handle(
    "sqlite:vector-search-memories",
    (_event, dbPath: string, embedding: number[], limit = 10) => {
      const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
      if (vecLoaded) {
        return {
          mode: "vec0" as const,
          rows: ctx.sqliteRuntime.selectStatement(
            dbPath,
            `SELECT m.id, m.title, m.category, m.content, m.file_path, m.created_at, m.updated_at
           FROM memory_items m
           JOIN memory_embeddings e ON m.id = e.id
           WHERE e.embedding MATCH ?
           ORDER BY distance
           LIMIT ?`,
            [embedding, limit]
          ),
        }
      }
      return {
        mode: "fallback" as const,
        rows: ctx.sqliteRuntime.vectorFallback.searchMemories(db as never, embedding, limit),
      }
    }
  )
  ipcMain.handle(
    "sqlite:vector-upsert-slice",
    (
      _event,
      dbPath: string,
      id: string,
      content: string,
      sessionId: string | null,
      memoryType: string,
      embedding: number[]
    ) => {
      const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
      if (vecLoaded) {
        ctx.sqliteRuntime.runStatement(
          dbPath,
          `INSERT OR REPLACE INTO memory_vector_slices (id, content, session_id, memory_type, embedding)
           VALUES (?, ?, ?, ?, ?)`,
          [id, content, sessionId, memoryType, embedding]
        )
        return { mode: "vec0" as const }
      }
      ctx.sqliteRuntime.vectorFallback.upsertMemorySlice(
        db as never,
        id,
        content,
        sessionId,
        memoryType,
        embedding
      )
      return { mode: "fallback" as const }
    }
  )
  ipcMain.handle(
    "sqlite:vector-search-slices",
    (_event, dbPath: string, embedding: number[], limit = 10, memoryType: string | null = null) => {
      const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
      if (vecLoaded) {
        let sql = `
          SELECT m.id, m.session_id, m.memory_type, m.content_preview, m.created_at, v.content
          FROM memory_slice_metadata m
          JOIN memory_vector_slices v ON m.id = v.id
          WHERE v.embedding MATCH ?
        `
        const params: unknown[] = [embedding]
        if (memoryType) {
          sql += ` AND m.memory_type = ?`
          params.push(memoryType)
        }
        sql += ` ORDER BY distance LIMIT ?`
        params.push(limit)
        return { mode: "vec0" as const, rows: ctx.sqliteRuntime.selectStatement(dbPath, sql, params) }
      }
      return {
        mode: "fallback" as const,
        rows: ctx.sqliteRuntime.vectorFallback.searchMemorySlices(
          db as never,
          embedding,
          limit,
          memoryType
        ),
      }
    }
  )

  ipcMain.handle("sqlite:execute", (_event, dbPath: string, sql: string, params: unknown[] = []) => {
    try {
      ctx.getSqlite(dbPath)
      const result = ctx.sqliteRuntime.runStatement(dbPath, sql, params)
      return { ok: true, rows: [], ...result }
    } catch (error) {
      if (vecErrorCode(error) === "VEC_UNAVAILABLE") {
        return {
          ok: false,
          vecUnavailable: true,
          error: error instanceof Error ? error.message : String(error),
          rows: [],
          lastInsertRowid: 0,
          changes: 0,
        }
      }
      throw error
    }
  })
  ipcMain.handle("sqlite:select", (_event, dbPath: string, sql: string, params: unknown[] = []) => {
    try {
      ctx.getSqlite(dbPath)
      return ctx.sqliteRuntime.selectStatement(dbPath, sql, params)
    } catch (error) {
      if (vecErrorCode(error) === "VEC_UNAVAILABLE") {
        return []
      }
      throw error
    }
  })
}
