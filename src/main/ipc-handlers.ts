import {
  messagesToChatHistory,
  primeChatHistory,
  runChatPromptStream,
} from "./chat-router"
import { BrowserWindow } from "electron"
import path from "node:path"
import {
  abortAgentSession,
  agentSessionExists,
  configureAgentSession,
  createAgentSession,
  destroyAgentSession,
  getPiSessionsDirectory,
  invalidatePiResourceLoaderCache,
  promptAgent,
  resolvePermissionPrompt,
} from "./pi-agent"
import { piCompleteMessages } from "./pi-llm"
import {
  takePendingPermissionGrant,
  type PermissionDialogAction,
  type PermissionRespondPayload,
} from "./pi-permission-ui"
import {
  createPiChatSession,
  deletePiChatSession,
  listPiChatSessions,
  listPiChatSessionsWithMessages,
  loadPiChatMessages,
  pruneEmptyPiChatSessions,
} from "./pi-disk-sessions"
import {
  applyPermissionGrantToGlobalPolicy,
  loadAgentPermissionSettings,
  resetAgentPermissionSettings,
  saveAgentPermissionSettings,
  type SaveAgentPermissionInput,
} from "./agent-permissions-store"
import {
  importSkillFromPath,
  installSkillByKey,
  listInstalledSkills,
  uninstallSkillByKey,
} from "./skill-install"
import { searchCatalogWithInstallState } from "./skill-catalog"
import { applyAppConfig } from "./app-config-sync"
import { loadAppConfig } from "./app-config"
import { testPiConnection } from "./pi-llm"
import { ingestDocumentFile, INGEST_FILE_EXTENSIONS } from "./knowledge/document-ingest"
import { log } from "./logger"
import {
  ensurePlaywrightChromium,
  getPlaywrightBrowserStatus,
} from "./playwright-browser-setup"
import type { IpcContext } from "./types"

/** 尽早注册 IPC，避免主进程顶部 native 模块加载失败时 handler 未注册。 */
export function registerIpcHandlers(ctx: IpcContext): void {
  const { ipcMain, app, dialog, storagePaths } = ctx

  ipcMain.handle("app:get-playwright-browser-status", () => getPlaywrightBrowserStatus())
  ipcMain.handle("app:ensure-playwright-browser", () => ensurePlaywrightChromium())
  ipcMain.handle("app:test-llm-connection", () => testPiConnection())

  ipcMain.handle("app:get-build-info", () => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    target: "electron",
    profile: app.isPackaged ? "release" : "debug",
  }))

  ipcMain.handle("app:get-storage-paths", () => ctx.getPaths())
  ipcMain.handle("app:save-storage-paths", async (_event, input) => {
    ctx.closeAllSqliteHandles()
    const paths = await storagePaths.saveStoragePaths(app, input)
    applyAppConfig(app, loadAppConfig(app))
    return paths
  })
  ipcMain.handle("app:reset-storage-paths", async () => {
    ctx.closeAllSqliteHandles()
    const paths = await storagePaths.resetStoragePaths(app)
    applyAppConfig(app, loadAppConfig(app))
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
  ipcMain.handle("app:pick-documents", async () => {
    const result = await dialog.showOpenDialog(ctx.mainWindow ?? (undefined as never), {
      properties: ["openFile", "multiSelections"],
      title: "选择要导入的文档",
      filters: [
        {
          name: "文档",
          extensions: INGEST_FILE_EXTENSIONS,
        },
      ],
    })
    if (result.canceled) return []
    return result.filePaths
  })
  ipcMain.handle("knowledge:ingest-document", async (_event, filePath: string) => {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new Error("无效的文件路径")
    }
    return ingestDocumentFile(filePath.trim())
  })
  ipcMain.handle("path:app-data-dir", () => ctx.appDataDir())
  ipcMain.handle("path:join", (_event, ...parts: string[]) => ctx.path.join(...parts))
  ipcMain.handle("app:get-migrations-dir", () => {
    const candidates = [
      ctx.path.join(ctx.app.getAppPath(), "drizzle"),
      ctx.path.join(process.cwd(), "drizzle"),
    ]
    for (const dir of candidates) {
      if (ctx.fsSync.existsSync(ctx.path.join(dir, "meta", "_journal.json"))) {
        return dir
      }
    }
    return ctx.path.join(process.cwd(), "drizzle")
  })

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
      const prime = primeMessages?.length
        ? messagesToChatHistory(primeMessages)
        : undefined

      await runChatPromptStream(
        input,
        { temperature, topK, maxTokens, useFunctions, primeMessages: prime },
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
  ipcMain.handle(
    "app:get-embeddings",
    async (_event, texts: string | string[], purpose?: "query" | "document") =>
      ctx.embedTexts(texts, purpose)
  )
  ipcMain.handle("app:get-embedding-status", () => ctx.getEmbeddingStatus())

  ipcMain.handle("sqlite:vec-status", (_event, dbPath: string) => {
    ctx.getSqlite(dbPath)
    return ctx.sqliteRuntime.getVecStatus(dbPath)
  })
  ipcMain.handle("sqlite:ensure-vector-schema", async (_event, dbPath: string) => {
    ctx.getSqlite(dbPath)
    return ctx.sqliteRuntime.ensureVectorSchema(dbPath)
  })
  ipcMain.handle(
    "sqlite:vector-upsert-memory",
    async (_event, dbPath: string, id: string, embedding: number[]) => {
      const { client } = ctx.sqliteRuntime.getEntry(dbPath)
      await ctx.sqliteRuntime.ensureVectorSchema(dbPath)
      await ctx.sqliteRuntime.libsqlVector.upsertMemoryEmbedding(client, id, embedding)
      return { mode: "libsql" as const }
    }
  )
  ipcMain.handle(
    "sqlite:vector-delete-memory",
    async (_event, dbPath: string, id: string) => {
      const { client } = ctx.sqliteRuntime.getEntry(dbPath)
      await ctx.sqliteRuntime.libsqlVector.deleteMemoryEmbedding(client, id)
      return { mode: "libsql" as const }
    }
  )
  ipcMain.handle(
    "sqlite:vector-search-memories",
    async (_event, dbPath: string, embedding: number[], limit = 10) => {
      const { client } = ctx.sqliteRuntime.getEntry(dbPath)
      await ctx.sqliteRuntime.ensureVectorSchema(dbPath)
      const rows = await ctx.sqliteRuntime.libsqlVector.searchMemories(
        client,
        embedding,
        limit
      )
      return { mode: "libsql" as const, rows }
    }
  )
  ipcMain.handle(
    "sqlite:vector-upsert-slice",
    async (
      _event,
      dbPath: string,
      id: string,
      content: string,
      sessionId: string | null,
      memoryType: string,
      embedding: number[]
    ) => {
      const { client } = ctx.sqliteRuntime.getEntry(dbPath)
      await ctx.sqliteRuntime.ensureVectorSchema(dbPath)
      await ctx.sqliteRuntime.libsqlVector.upsertMemorySlice(
        client,
        id,
        content,
        sessionId,
        memoryType,
        embedding
      )
      return { mode: "libsql" as const }
    }
  )
  ipcMain.handle(
    "sqlite:vector-search-slices",
    async (
      _event,
      dbPath: string,
      embedding: number[],
      limit = 10,
      memoryType: string | null = null
    ) => {
      const { client } = ctx.sqliteRuntime.getEntry(dbPath)
      await ctx.sqliteRuntime.ensureVectorSchema(dbPath)
      const rows = await ctx.sqliteRuntime.libsqlVector.searchMemorySlices(
        client,
        embedding,
        limit,
        memoryType
      )
      return { mode: "libsql" as const, rows }
    }
  )

  ipcMain.handle(
    "sqlite:execute",
    async (_event, dbPath: string, sql: string, params: unknown[] = []) => {
      ctx.getSqlite(dbPath)
      const result = await ctx.sqliteRuntime.runStatement(dbPath, sql, params)
      return { ok: true, rows: [], ...result }
    }
  )
  ipcMain.handle(
    "sqlite:select",
    async (_event, dbPath: string, sql: string, params: unknown[] = []) => {
      ctx.getSqlite(dbPath)
      return await ctx.sqliteRuntime.selectStatement(dbPath, sql, params)
    }
  )

  ipcMain.handle("pi-sessions:get-dir", () => getPiSessionsDirectory())
  ipcMain.handle("pi-sessions:list", () => listPiChatSessions(app))
  ipcMain.handle("pi-sessions:list-with-messages", () =>
    listPiChatSessionsWithMessages(app)
  )
  ipcMain.handle("pi-sessions:create", () => createPiChatSession(app))
  ipcMain.handle("pi-sessions:load-messages", (_event, sessionId: string) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("无效会话 id")
    }
    return loadPiChatMessages(app, sessionId.trim())
  })
  ipcMain.handle("pi-sessions:delete", async (_event, sessionId: string) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("无效会话 id")
    }
    const id = sessionId.trim()
    if (agentSessionExists(id)) {
      await destroyAgentSession(id)
    }
    await deletePiChatSession(app, id)
    return { ok: true }
  })
  ipcMain.handle(
    "pi-sessions:prune-empty",
    (_event, keepSessionId?: string | null) =>
      pruneEmptyPiChatSessions(app, keepSessionId ?? null)
  )

  ipcMain.handle(
    "agent:create",
    async (
      event,
      options?: {
        diskSessionId?: string
        createNew?: boolean
        sceneSkillIds?: string[]
      }
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) throw new Error("no window")
      return createAgentSession(window, options ?? {})
    }
  )

  // agent:prompt - 发送消息给 Agent
  ipcMain.handle("agent:prompt", async (_event, { sessionId, message }: { sessionId: string; message: string }) => {
    if (!agentSessionExists(sessionId)) throw new Error("session not found")
    try {
      await promptAgent(sessionId, message)
      return { ok: true }
    } catch (error) {
      log.error("[agent:prompt]", error instanceof Error ? error.message : error)
      throw error
    }
  })

  // agent:destroy - 销毁 Agent 会话
  ipcMain.handle("agent:destroy", async (_event, { sessionId }: { sessionId: string }) => {
    await destroyAgentSession(sessionId)
    return { ok: true }
  })

  ipcMain.handle(
    "agent:configure",
    (_event, payload: { sessionId: string; systemPrompt: string }) => {
      configureAgentSession(payload.sessionId, {
        systemPrompt: payload.systemPrompt,
      })
      return { ok: true }
    }
  )

  ipcMain.handle("agent:abort", (_event, { sessionId }: { sessionId: string }) => {
    abortAgentSession(sessionId)
    return { ok: true }
  })

  ipcMain.handle(
    "agent:permission-respond",
    (_event, payload: PermissionRespondPayload) => {
      const sessionId = payload.sessionId?.trim()
      const requestId = payload.requestId?.trim()
      if (!sessionId || !requestId) {
        return { ok: false }
      }

      const PI_YES = "Yes"
      const PI_NO = "No"
      const PI_DENY_REASON = "No, provide reason"

      let value = payload.value
      const action = payload.action as PermissionDialogAction | undefined

      if (action === "allow-once") {
        value = PI_YES
      } else if (action === "allow-always") {
        const grantTarget = takePendingPermissionGrant(sessionId, requestId)
        if (grantTarget) {
          applyPermissionGrantToGlobalPolicy(app, grantTarget)
          invalidatePiResourceLoaderCache()
        }
        value = PI_YES
      } else if (action === "deny") {
        value = PI_NO
      } else if (action === "deny-reason") {
        value = PI_DENY_REASON
      }

      const ok = resolvePermissionPrompt(sessionId, requestId, value)
      return { ok }
    }
  )

  ipcMain.handle("app:get-agent-permission-settings", () =>
    loadAgentPermissionSettings(app)
  )

  ipcMain.handle(
    "app:save-agent-permission-settings",
    (_event, input: SaveAgentPermissionInput) => {
      const saved = saveAgentPermissionSettings(app, input)
      invalidatePiResourceLoaderCache()
      return saved
    }
  )

  ipcMain.handle("app:reset-agent-permission-settings", () => {
    const saved = resetAgentPermissionSettings(app)
    invalidatePiResourceLoaderCache()
    return saved
  })

  ipcMain.handle("skills:catalog-search", async (_event, { query }: { query?: string }) => {
    const dataRoot = ctx.getPaths().dataRoot
    const list = await listInstalledSkills(dataRoot)
    const keys = new Set(list.map((s) => s.installKey))
    return searchCatalogWithInstallState(query ?? "", keys)
  })

  ipcMain.handle("skills:list-installed", async () => {
    return listInstalledSkills(ctx.getPaths().dataRoot)
  })

  ipcMain.handle("skills:install", async (_event, { installKey }: { installKey: string }) => {
    return installSkillByKey(ctx.getPaths().dataRoot, installKey.trim())
  })

  ipcMain.handle("skills:uninstall", async (_event, { installKey }: { installKey: string }) => {
    await uninstallSkillByKey(ctx.getPaths().dataRoot, installKey.trim())
    return { ok: true as const }
  })

  ipcMain.handle("skills:import-from-path", async (_event, { sourcePath }: { sourcePath: string }) => {
    return importSkillFromPath(ctx.getPaths().dataRoot, sourcePath)
  })

  ipcMain.handle("pi:complete", async (_event, payload: {
    messages: { role: "system" | "user" | "assistant"; content: string }[]
    systemPrompt?: string
    maxTokens?: number
  }) => {
    return piCompleteMessages(payload.messages, {
      systemPrompt: payload.systemPrompt,
      maxTokens: payload.maxTokens,
    })
  })
}
