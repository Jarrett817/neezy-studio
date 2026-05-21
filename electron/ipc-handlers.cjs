/**
 * 尽早注册 IPC，避免 main.cjs 顶部 native 模块加载失败时 handler 未注册。
 */
function registerIpcHandlers(ctx) {
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
    return storagePaths.saveStoragePaths(app, input)
  })
  ipcMain.handle("app:reset-storage-paths", async () => {
    ctx.closeAllSqliteHandles()
    ctx.invalidateModelScanCache?.()
    return storagePaths.resetStoragePaths(app)
  })
  ipcMain.handle("app:pick-directory", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(ctx.mainWindow ?? undefined, {
      properties: ["openDirectory", "createDirectory"],
      title: options.title ?? "选择文件夹",
      defaultPath: options.defaultPath,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle("path:app-data-dir", () => ctx.appDataDir())
  ipcMain.handle("path:join", (_event, ...parts) => ctx.path.join(...parts))
  ipcMain.handle("app:get-migrations-dir", () => ctx.path.join(__dirname, "..", "drizzle"))

  ipcMain.handle("fs:exists", async (_event, targetPath) => ctx.fsSync.existsSync(targetPath))
  ipcMain.handle("fs:mkdir", async (_event, targetPath, options) => ctx.fs.mkdir(targetPath, options))
  ipcMain.handle("fs:read-text-file", async (_event, targetPath) => ctx.fs.readFile(targetPath, "utf8"))
  ipcMain.handle("fs:write-text-file", async (_event, targetPath, content) => {
    await ctx.fs.mkdir(ctx.path.dirname(targetPath), { recursive: true })
    await ctx.fs.writeFile(targetPath, content, "utf8")
  })
  ipcMain.handle("fs:remove", async (_event, targetPath) => ctx.fs.rm(targetPath, { recursive: true, force: true }))
  ipcMain.handle("fs:read-dir", async (_event, targetPath) => {
    const entries = await ctx.fs.readdir(targetPath, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }))
  })

  ipcMain.handle("app:get-runtime-metrics", () => ctx.runtimeMetrics())
  ipcMain.handle("app:get-model-recommendations", () => ctx.runtimeMetrics())
  ipcMain.handle("app:get-model-catalog", (_event, kind) => ctx.getModelCatalog(kind))
  ipcMain.handle("app:list-llm-models", async () => {
    await ctx.fs.mkdir(ctx.modelsDir(), { recursive: true })
    const entries = await ctx.fs.readdir(ctx.modelsDir(), { withFileTypes: true })
    const catalogFiles = new Set(
      ctx.ALL_MODELS.flatMap((model) => [model.fileName, ...(model.aliases || [])])
    )
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".gguf"))
      .map((entry) => ({
        id: entry.name,
        name: entry.name.replace(/\.gguf$/i, ""),
        path: ctx.path.join(ctx.modelsDir(), entry.name),
        managed: catalogFiles.has(entry.name),
      }))
  })
  ipcMain.handle("app:download-model", async (_event, modelId) => ctx.downloadModel(modelId))
  ipcMain.handle("app:delete-model", async (_event, modelId) => ctx.deleteModel(modelId))
  ipcMain.handle("app:load-embedding-model", async (_event, modelId) => ctx.loadEmbeddingModel(modelId))
  ipcMain.handle("app:unload-embedding-model", () => ctx.unloadEmbeddingModel())
  ipcMain.handle("app:get-chat-model-file-info", (_event, fileName) =>
    ctx.getChatModelFileInfo(fileName)
  )
  ipcMain.handle("app:get-embeddings", async (_event, texts) => ctx.embedTexts(texts))
  ipcMain.handle("app:get-embedding-status", () => ctx.getEmbeddingStatus())

  ipcMain.handle("sqlite:vec-status", (_event, dbPath) => {
    ctx.getSqlite(dbPath)
    return ctx.sqliteRuntime.getVecStatus(dbPath)
  })
  ipcMain.handle("sqlite:ensure-vector-schema", (_event, dbPath) => {
    ctx.getSqlite(dbPath)
    return ctx.sqliteRuntime.ensureVectorSchema(dbPath)
  })
  ipcMain.handle("sqlite:vector-upsert-memory", (_event, dbPath, id, embedding) => {
    const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
    if (vecLoaded) {
      ctx.sqliteRuntime.runStatement(
        dbPath,
        `INSERT OR REPLACE INTO memory_embeddings (id, embedding) VALUES (?, ?)`,
        [id, embedding]
      )
      return { mode: "vec0" }
    }
    ctx.sqliteRuntime.vectorFallback.upsertMemoryEmbedding(db, id, embedding)
    return { mode: "fallback" }
  })
  ipcMain.handle("sqlite:vector-delete-memory", (_event, dbPath, id) => {
    const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
    if (vecLoaded) {
      ctx.sqliteRuntime.runStatement(dbPath, `DELETE FROM memory_embeddings WHERE id = ?`, [id])
      return { mode: "vec0" }
    }
    ctx.sqliteRuntime.vectorFallback.deleteMemoryEmbedding(db, id)
    return { mode: "fallback" }
  })
  ipcMain.handle("sqlite:vector-search-memories", (_event, dbPath, embedding, limit = 10) => {
    const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
    if (vecLoaded) {
      return {
        mode: "vec0",
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
      mode: "fallback",
      rows: ctx.sqliteRuntime.vectorFallback.searchMemories(db, embedding, limit),
    }
  })
  ipcMain.handle(
    "sqlite:vector-upsert-slice",
    (_event, dbPath, id, content, sessionId, memoryType, embedding) => {
      const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
      if (vecLoaded) {
        ctx.sqliteRuntime.runStatement(
          dbPath,
          `INSERT OR REPLACE INTO memory_vector_slices (id, content, session_id, memory_type, embedding)
           VALUES (?, ?, ?, ?, ?)`,
          [id, content, sessionId, memoryType, embedding]
        )
        return { mode: "vec0" }
      }
      ctx.sqliteRuntime.vectorFallback.upsertMemorySlice(
        db,
        id,
        content,
        sessionId,
        memoryType,
        embedding
      )
      return { mode: "fallback" }
    }
  )
  ipcMain.handle(
    "sqlite:vector-search-slices",
    (_event, dbPath, embedding, limit = 10, memoryType = null) => {
      const { db, vecLoaded } = ctx.sqliteRuntime.getEntry(dbPath)
      if (vecLoaded) {
        let sql = `
          SELECT m.id, m.session_id, m.memory_type, m.content_preview, m.created_at, v.content
          FROM memory_slice_metadata m
          JOIN memory_vector_slices v ON m.id = v.id
          WHERE v.embedding MATCH ?
        `
        const params = [embedding]
        if (memoryType) {
          sql += ` AND m.memory_type = ?`
          params.push(memoryType)
        }
        sql += ` ORDER BY distance LIMIT ?`
        params.push(limit)
        return { mode: "vec0", rows: ctx.sqliteRuntime.selectStatement(dbPath, sql, params) }
      }
      return {
        mode: "fallback",
        rows: ctx.sqliteRuntime.vectorFallback.searchMemorySlices(
          db,
          embedding,
          limit,
          memoryType
        ),
      }
    }
  )

  ipcMain.handle("sqlite:execute", (_event, dbPath, sql, params = []) => {
    try {
      ctx.getSqlite(dbPath)
      const result = ctx.sqliteRuntime.runStatement(dbPath, sql, params)
      return { ok: true, rows: [], ...result }
    } catch (error) {
      if (error?.code === "VEC_UNAVAILABLE") {
        return {
          ok: false,
          vecUnavailable: true,
          error: error.message,
          rows: [],
          lastInsertRowid: 0,
          changes: 0,
        }
      }
      throw error
    }
  })
  ipcMain.handle("sqlite:select", (_event, dbPath, sql, params = []) => {
    try {
      ctx.getSqlite(dbPath)
      return ctx.sqliteRuntime.selectStatement(dbPath, sql, params)
    } catch (error) {
      if (error?.code === "VEC_UNAVAILABLE") {
        return []
      }
      throw error
    }
  })
}

module.exports = { registerIpcHandlers }
