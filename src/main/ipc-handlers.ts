import { BrowserWindow } from "electron"
import type { McpServerDraft } from "../shared/mcp-config"
import type { ScheduledTask } from "../shared/scheduled-tasks"
import {
  applyPermissionGrantToGlobalPolicy,
  loadAgentPermissionSettings,
  resetAgentPermissionSettings,
  type SaveAgentPermissionInput,
  saveAgentPermissionSettings,
} from "./agent-permissions-store"
import { loadAppConfig } from "./app-config"
import { applyAppConfig } from "./app-config-sync"
import { log } from "./logger"
import {
  loadMcpConfig,
  readMcpJson,
  saveMcpConfig,
  writeMcpJson,
} from "./mcp-config-store"
import { runTaskNow } from "./scheduler"
import {
  loadScheduledTasks,
  removeScheduledTask,
  upsertScheduledTask,
} from "./scheduled-tasks-store"
import { broadcastTasksChanged } from "./tasks-broadcast"
import { readAgentDirAgentsMd, writeAgentDirAgentsMd } from "./agents-md"
import { assertPathAllowed } from "./path-guard"
import {
  abortAgentSession,
  agentSessionExists,
  createAgentSession,
  destroyAgentSession,
  destroyAllAgentSessions,
  getAgentContextUsage,
  getPiSessionsDirectory,
  invalidatePiResourceLoaderCache,
  listAgentSkillCommands,
  promptAgent,
  renameAgentSession,
  resolvePermissionPrompt,
} from "./pi-agent"
import {
  createPiChatSession,
  deletePiChatSession,
  listPiChatSessions,
  listPiChatSessionsWithMessages,
  loadPiChatMessages,
  pruneEmptyPiChatSessions,
} from "./pi-disk-sessions"
import { testPiConnection } from "./pi-llm"
import {
  type PermissionDialogAction,
  type PermissionRespondPayload,
  takePendingPermissionGrant,
} from "./pi-permission-ui"
import {
  importSkillFromPath,
  listInstalledSkills,
  uninstallSkillByKey,
} from "./skill-install"
import type { IpcContext } from "./types"

/** 尽早注册 IPC，避免主进程顶部 native 模块加载失败时 handler 未注册。 */
export function registerIpcHandlers(ctx: IpcContext): void {
  const { ipcMain, app, dialog, storagePaths } = ctx

  ipcMain.handle("app:test-llm-connection", () => testPiConnection())

  ipcMain.handle("app:get-build-info", () => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    target: "electron",
    profile: app.isPackaged ? "release" : "debug",
  }))

  ipcMain.handle("app:get-storage-paths", () => ctx.getPaths())
  ipcMain.handle("app:get-agents-md", () => readAgentDirAgentsMd(app))
  ipcMain.handle("app:save-agents-md", async (_event, content: unknown) => {
    if (typeof content !== "string") {
      throw new Error("无效内容")
    }
    await writeAgentDirAgentsMd(app, content)
    invalidatePiResourceLoaderCache()
    await destroyAllAgentSessions()
    return { ok: true }
  })
  ipcMain.handle(
    "app:save-workspace-dir",
    async (_event, workspaceDir: string | null) => {
      const paths = await storagePaths.saveWorkspaceDir(app, workspaceDir)
      await destroyAllAgentSessions()
      return paths
    }
  )
  ipcMain.handle(
    "app:pick-directory",
    async (_event, options: { title?: string; defaultPath?: string } = {}) => {
      const result = await dialog.showOpenDialog(
        ctx.mainWindow ?? (undefined as never),
        {
          properties: ["openDirectory", "createDirectory"],
          title: options.title ?? "选择文件夹",
          defaultPath: options.defaultPath,
        }
      )
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    }
  )
  ipcMain.handle("path:app-data-dir", () => ctx.appDataDir())
  ipcMain.handle("path:join", (_event, ...parts: string[]) =>
    ctx.path.join(...parts)
  )
  ipcMain.handle("fs:exists", async (event, targetPath: string) => {
    await assertPathAllowed(ctx, event, targetPath, "检查")
    return ctx.fsSync.existsSync(targetPath)
  })
  ipcMain.handle(
    "fs:mkdir",
    async (event, targetPath: string, options?: { recursive?: boolean }) => {
      await assertPathAllowed(ctx, event, targetPath, "创建目录")
      return ctx.fs.mkdir(targetPath, options)
    }
  )
  ipcMain.handle("fs:read-text-file", async (event, targetPath: string) => {
    await assertPathAllowed(ctx, event, targetPath, "读取")
    return ctx.fs.readFile(targetPath, "utf8")
  })
  ipcMain.handle(
    "fs:write-text-file",
    async (event, targetPath: string, content: string) => {
      await assertPathAllowed(ctx, event, targetPath, "写入")
      await ctx.fs.mkdir(ctx.path.dirname(targetPath), { recursive: true })
      await ctx.fs.writeFile(targetPath, content, "utf8")
    }
  )
  ipcMain.handle("fs:remove", async (event, targetPath: string) => {
    await assertPathAllowed(ctx, event, targetPath, "删除")
    return ctx.fs.rm(targetPath, { recursive: true, force: true })
  })
  ipcMain.handle("fs:read-dir", async (event, targetPath: string) => {
    await assertPathAllowed(ctx, event, targetPath, "列出目录")
    const entries = await ctx.fs.readdir(targetPath, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }))
  })

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
    "pi-sessions:rename",
    async (_event, payload: { sessionId?: string; name?: string }) => {
      const sessionId = payload?.sessionId?.trim() ?? ""
      if (!sessionId) throw new Error("无效会话 id")
      await renameAgentSession(sessionId, payload?.name ?? "")
      return { ok: true }
    }
  )
  ipcMain.handle(
    "agent:context-usage",
    (_event, payload: { sessionId?: string }) => {
      const sessionId = payload?.sessionId?.trim() ?? ""
      if (!sessionId) return null
      return getAgentContextUsage(sessionId)
    }
  )
  ipcMain.handle(
    "agent:skill-commands",
    (_event, payload: { sessionId?: string }) => {
      const sessionId = payload?.sessionId?.trim() ?? ""
      if (!sessionId) return []
      return listAgentSkillCommands(sessionId)
    }
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

  ipcMain.handle(
    "agent:exists",
    (_event, { sessionId }: { sessionId: string }) =>
      agentSessionExists(sessionId)
  )

  // agent:prompt - 发送消息给 Agent
  ipcMain.handle(
    "agent:prompt",
    async (
      _event,
      {
        sessionId,
        message,
        images,
      }: { sessionId: string; message: string; images?: unknown }
    ) => {
      if (!agentSessionExists(sessionId)) throw new Error("session not found")
      try {
        await promptAgent(sessionId, message, images)
        return { ok: true }
      } catch (error) {
        log.error(
          "[agent:prompt]",
          error instanceof Error ? error.message : error
        )
        throw error
      }
    }
  )

  // agent:destroy - 销毁 Agent 会话
  ipcMain.handle(
    "agent:destroy",
    async (_event, { sessionId }: { sessionId: string }) => {
      await destroyAgentSession(sessionId)
      return { ok: true }
    }
  )

  ipcMain.handle(
    "agent:abort",
    (_event, { sessionId }: { sessionId: string }) => {
      abortAgentSession(sessionId)
      return { ok: true }
    }
  )

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

  ipcMain.handle("skills:list-installed", async () => {
    return listInstalledSkills(app)
  })

  ipcMain.handle(
    "skills:uninstall",
    async (_event, { installKey }: { installKey: string }) => {
      await uninstallSkillByKey(app, installKey.trim())
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    "skills:import-from-path",
    async (_event, { sourcePath }: { sourcePath: string }) => {
      return importSkillFromPath(app, sourcePath)
    }
  )

  ipcMain.handle("mcp:get-config", () => loadMcpConfig(app))

  ipcMain.handle(
    "mcp:save-config",
    async (_event, servers: McpServerDraft[]) => {
      const saved = saveMcpConfig(app, servers)
      await destroyAllAgentSessions()
      return saved
    }
  )

  ipcMain.handle("mcp:get-json", () => readMcpJson(app))

  ipcMain.handle("mcp:save-json", async (_event, content: unknown) => {
    if (typeof content !== "string") {
      throw new Error("无效内容")
    }
    await writeMcpJson(app, content)
    invalidatePiResourceLoaderCache()
    await destroyAllAgentSessions()
    return { ok: true }
  })

  // ---- 定时任务 ----
  ipcMain.handle("tasks:list", () => loadScheduledTasks())

  ipcMain.handle("tasks:upsert", async (_event, task: ScheduledTask) => {
    const tasks = await upsertScheduledTask(task)
    broadcastTasksChanged()
    return tasks
  })

  ipcMain.handle("tasks:remove", async (_event, id: string) => {
    const tasks = await removeScheduledTask(id.trim())
    broadcastTasksChanged()
    return tasks
  })

  ipcMain.handle("tasks:run-now", async (_event, id: string) => {
    await runTaskNow(id.trim())
    return { ok: true }
  })
}
