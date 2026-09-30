import { contextBridge, ipcRenderer, webUtils } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  getBuildInfo: () => ipcRenderer.invoke("app:get-build-info"),
  syncRuntimeSettings: (settings: unknown) =>
    ipcRenderer.invoke("app:sync-runtime-settings", settings),
  getAppConfig: () => ipcRenderer.invoke("app:get-app-config"),
  saveAppConfig: (config: unknown) =>
    ipcRenderer.invoke("app:save-app-config", config),
  testLlmConnection: () => ipcRenderer.invoke("app:test-llm-connection"),
  listOpenAiModels: (payload: { baseUrl: string; apiKey: string }) =>
    ipcRenderer.invoke("app:list-openai-models", payload),
  appDataDir: () => ipcRenderer.invoke("path:app-data-dir"),
  getStoragePaths: () => ipcRenderer.invoke("app:get-storage-paths"),
  saveStoragePaths: (input: { dataRoot: string }) =>
    ipcRenderer.invoke("app:save-storage-paths", input),
  resetStoragePaths: () => ipcRenderer.invoke("app:reset-storage-paths"),
  saveWorkspaceDir: (workspaceDir: string | null) =>
    ipcRenderer.invoke("app:save-workspace-dir", workspaceDir),
  pickDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke("app:pick-directory", options),
  join: (...parts: string[]) => ipcRenderer.invoke("path:join", ...parts),
  exists: (targetPath: string) => ipcRenderer.invoke("fs:exists", targetPath),
  mkdir: (targetPath: string, options?: { recursive?: boolean }) =>
    ipcRenderer.invoke("fs:mkdir", targetPath, options),
  readTextFile: (targetPath: string) =>
    ipcRenderer.invoke("fs:read-text-file", targetPath),
  writeTextFile: (targetPath: string, content: string) =>
    ipcRenderer.invoke("fs:write-text-file", targetPath, content),
  remove: (targetPath: string) => ipcRenderer.invoke("fs:remove", targetPath),
  readDir: (targetPath: string) =>
    ipcRenderer.invoke("fs:read-dir", targetPath),
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
  getMcpConfig: () => ipcRenderer.invoke("mcp:get-config"),
  saveMcpConfig: (servers: unknown) =>
    ipcRenderer.invoke("mcp:save-config", servers),

  // ---- 定时任务 ----
  tasksList: () => ipcRenderer.invoke("tasks:list"),
  tasksUpsert: (task: unknown) => ipcRenderer.invoke("tasks:upsert", task),
  tasksRemove: (id: string) => ipcRenderer.invoke("tasks:remove", id),
  tasksRunNow: (id: string) => ipcRenderer.invoke("tasks:run-now", id),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // ---- Agent ----
  agentCreate: (options?: {
    diskSessionId?: string
    createNew?: boolean
    sceneSkillIds?: string[]
  }) => ipcRenderer.invoke("agent:create", options),
  agentConfigure: (payload: { sessionId: string; systemPrompt: string }) =>
    ipcRenderer.invoke("agent:configure", payload),
  agentPrompt: (payload: {
    sessionId: string
    message: string
    images?: unknown
  }) => ipcRenderer.invoke("agent:prompt", payload),
  agentAbort: (sessionId: string) =>
    ipcRenderer.invoke("agent:abort", { sessionId }),
  agentDestroy: (sessionId: string) =>
    ipcRenderer.invoke("agent:destroy", { sessionId }),
  agentContextUsage: (sessionId: string) =>
    ipcRenderer.invoke("agent:context-usage", { sessionId }),
  agentSkillCommands: (sessionId: string) =>
    ipcRenderer.invoke("agent:skill-commands", { sessionId }),
  agentPermissionRespond: (payload: {
    sessionId: string
    requestId: string
    action?: string
    value?: string
  }) => ipcRenderer.invoke("agent:permission-respond", payload),

  // ---- Pi sessions ----
  piSessionsGetDir: () => ipcRenderer.invoke("pi-sessions:get-dir"),
  piSessionsList: () => ipcRenderer.invoke("pi-sessions:list"),
  piSessionsListWithMessages: () =>
    ipcRenderer.invoke("pi-sessions:list-with-messages"),
  piSessionsCreate: () => ipcRenderer.invoke("pi-sessions:create"),
  piSessionsLoadMessages: (sessionId: string) =>
    ipcRenderer.invoke("pi-sessions:load-messages", sessionId),
  piSessionsRename: (payload: { sessionId: string; name: string }) =>
    ipcRenderer.invoke("pi-sessions:rename", payload),
  piSessionsDelete: (sessionId: string) =>
    ipcRenderer.invoke("pi-sessions:delete", sessionId),
  piSessionsPruneEmpty: (keepSessionId?: string | null) =>
    ipcRenderer.invoke("pi-sessions:prune-empty", keepSessionId ?? null),

  // ---- 事件订阅（返回取消订阅函数）----
  onAgentEvent: (handler: (payload: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on("agent:event", listener)
    return () => ipcRenderer.removeListener("agent:event", listener)
  },
  onAgentPermissionPrompt: (handler: (payload: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on("agent:permission-prompt", listener)
    return () => ipcRenderer.removeListener("agent:permission-prompt", listener)
  },
  onAgentPermissionNotify: (handler: (payload: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on("agent:permission-notify", listener)
    return () => ipcRenderer.removeListener("agent:permission-notify", listener)
  },
  onTasksChanged: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on("tasks:changed", listener)
    return () => ipcRenderer.removeListener("tasks:changed", listener)
  },
})
