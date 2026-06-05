import {
  createAgentSession as createPiAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SettingsManager,
  type ResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent"
import type { SessionManager } from "@earendil-works/pi-coding-agent"
import type { Api, Model } from "@earendil-works/pi-ai"
import type { BrowserWindow } from "electron"
import { app } from "electron"
import fs from "node:fs"
import path from "node:path"

import { normalizeMainChatModels, resolveEntryApiKey } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import {
  createPiSessionManager,
  findPiSessionById,
  getPiSessionsDir,
  openPiSessionManager,
} from "./pi-disk-sessions"
import { getPiAuthStorage, syncPiAuthForRoute } from "./pi-sdk-auth"
import { resolveAgentThinkingLevel, resolvePiChatModel } from "./pi-model"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import { applyPlaywrightBrowsersPath } from "./playwright-browser-setup"
import { getNeezyCustomTools } from "./pi-tool-registry"
import {
  getBundledPiExtensionPaths,
  getBundledPiSkillPaths,
} from "./pi-bundled-extensions"
import { ensurePiAgentEnvironment, getPiAgentDir } from "./pi-agent-env"
import {
  clearPermissionPromptsForSession,
  createElectronPermissionUi,
} from "./pi-permission-ui"
import { resolveStoragePaths } from "./storage-paths"
import { log } from "./logger"
import { listAllInstalledSkillDirs } from "./skill-install"

export interface CreateDiskAgentOptions {
  diskSessionId?: string
  createNew?: boolean
}

interface IpcAgentSession {
  diskSessionId: string
  session: AgentSession
  unsubscribe: () => void
  window: BrowserWindow
}

const ipcSessions = new Map<string, IpcAgentSession>()

/** 同一陈旧 id 多次 agent:create 时复用已恢复的磁盘会话，避免疯狂新建 */
const staleDiskSessionRecovery = new Map<string, string>()

/** 每个磁盘会话在本进程内仅尝试一次 /chrome authorize 引导 */
const chromeAuthorizePrompted = new Set<string>()

let resourceLoaderCache: { key: string; loader: ResourceLoader } | null = null
let bundledExtensionsLogged = false

export function invalidatePiResourceLoaderCache(): void {
  resourceLoaderCache = null
}

let modelRegistry: ModelRegistry | null = null

function getModelRegistry(): ModelRegistry {
  if (!modelRegistry) {
    modelRegistry = ModelRegistry.inMemory(getPiAuthStorage())
  }
  return modelRegistry
}

function getPiDirs() {
  const paths = resolveStoragePaths(app)
  return { cwd: paths.dataRoot, agentDir: ensurePiAgentEnvironment(app) }
}

function buildSettingsManager(cwd: string, agentDir: string): SettingsManager {
  const sm = SettingsManager.create(cwd, agentDir)
  const level = resolveAgentThinkingLevel(resolvePiChatModel())
  sm.applyOverrides({
    defaultThinkingLevel: level === "off" ? "off" : level,
    compaction: { enabled: true },
  })
  return sm
}

function resolveAdditionalSkillPaths(cwd: string): string[] {
  return [...listAllInstalledSkillDirs(cwd), ...getBundledPiSkillPaths()]
}

async function getResourceLoader(
  cwd: string,
  agentDir: string,
  settingsManager: SettingsManager
): Promise<ResourceLoader> {
  const skillKey = listAllInstalledSkillDirs(cwd).sort().join(",")
  const key = `${cwd}\0${agentDir}\0${skillKey}`
  if (resourceLoaderCache?.key === key) {
    return resourceLoaderCache.loader
  }

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: getBundledPiExtensionPaths(),
    additionalSkillPaths: resolveAdditionalSkillPaths(cwd),
  })
  await loader.reload()
  const ext = loader.getExtensions()
  for (const err of ext.errors) {
    log.warn("[pi-agent] extension load failed:", err.path, err.error)
  }
  const loaded = ext.extensions.map((e) => e.path)
  const hasPermissionSystem = loaded.some((p) => p.includes("pi-permission-system"))
  const hasWebAccess = loaded.some((p) => p.includes("pi-web-access"))
  const hasTextBrowser = loaded.some((p) => p.includes("pi-textbrowser"))
  const hasPiChrome = loaded.some((p) => p.includes("pi-chrome"))
  if (!hasPermissionSystem) {
    log.error(
      "[pi-agent] pi-permission-system 未加载，文件读写/bash 不会出现确认框。请查看上方 extension load failed 日志。"
    )
  }
  if (!hasWebAccess) {
    log.error(
      "[pi-agent] pi-web-access 未加载，web_search / fetch_content 等不可用。请查看上方 extension load failed 日志。"
    )
  }
  if (!hasTextBrowser) {
    log.error(
      "[pi-agent] pi-textbrowser 未加载，browser_navigate 等不可用。请查看上方 extension load failed 日志。"
    )
  }
  if (!hasPiChrome) {
    log.error(
      "[pi-agent] pi-chrome 未加载，chrome_* 不可用。请查看上方 extension load failed 日志。"
    )
  }
  if (!bundledExtensionsLogged && loaded.length > 0) {
    bundledExtensionsLogged = true
    log.info("[pi-agent] bundled extensions:", loaded.join(", "))
  }
  resourceLoaderCache = { key, loader }
  return loader
}

async function bindAgentSessionUi(
  session: AgentSession,
  window: BrowserWindow,
  diskSessionId: string
): Promise<void> {
  await session.bindExtensions({
    uiContext: createElectronPermissionUi(window, diskSessionId),
  })
  // 勿传 createAgentSession({ tools })：该字段是 allowlist，会屏蔽扩展工具。
  // 不传时 SDK 仅默认激活 read/bash/edit/write；此处把 registry 内工具全部设为 active。
  session.setActiveToolsByName(session.getAllTools().map((t) => t.name))
}

async function maybePromptChromeAuthorize(
  session: AgentSession,
  diskSessionId: string
): Promise<void> {
  if (chromeAuthorizePrompted.has(diskSessionId)) return
  chromeAuthorizePrompted.add(diskSessionId)
  try {
    await session.prompt("/chrome authorize indefinite")
  } catch (error) {
    log.warn(
      "[pi-agent] Chrome 授权引导未完成:",
      error instanceof Error ? error.message : error
    )
  }
}

function syncSessionChatRoute(session: AgentSession, userMessage?: string): void {
  const model = resolvePiChatModel(userMessage)
  session.agent.state.model = model
  session.setThinkingLevel(resolveAgentThinkingLevel(model))
  syncPiAuthForRoute(userMessage)
}

async function resolveSessionManager(
  options: CreateDiskAgentOptions
): Promise<{ sm: SessionManager; diskSessionId: string }> {
  if (options.createNew) {
    const sm = createPiSessionManager(app)
    return { sm, diskSessionId: sm.getSessionId() }
  }
  if (options.diskSessionId) {
    const meta = await findPiSessionById(app, options.diskSessionId)
    if (meta) {
      const sm = openPiSessionManager(app, meta.path)
      return { sm, diskSessionId: sm.getSessionId() }
    }

    const recoveredId = staleDiskSessionRecovery.get(options.diskSessionId)
    if (recoveredId) {
      const recovered = await findPiSessionById(app, recoveredId)
      if (recovered) {
        const sm = openPiSessionManager(app, recovered.path)
        return { sm, diskSessionId: sm.getSessionId() }
      }
      staleDiskSessionRecovery.delete(options.diskSessionId)
    }

    const sm = createPiSessionManager(app)
    const newId = sm.getSessionId()
    staleDiskSessionRecovery.set(options.diskSessionId, newId)
    log.warn("[pi-agent] 磁盘会话缺失，已恢复新建:", options.diskSessionId, "→", newId)
    return { sm, diskSessionId: newId }
  }
  throw new Error("缺少 diskSessionId，请先创建或选择 Pi 磁盘会话")
}

async function createPiSession(sessionManager: SessionManager): Promise<AgentSession> {
  applyPlaywrightBrowsersPath()
  const { cwd, agentDir } = getPiDirs()
  const model = resolvePiChatModel()
  syncPiAuthForRoute()
  const settingsManager = buildSettingsManager(cwd, agentDir)

  const { session } = await createPiAgentSession({
    cwd,
    agentDir,
    authStorage: getPiAuthStorage(),
    modelRegistry: getModelRegistry(),
    model: model as Model<Api>,
    thinkingLevel: resolveAgentThinkingLevel(model),
    settingsManager,
    // 勿传 tools 白名单：SDK 规定传入后仅启用列出的工具，会屏蔽 pi-web-access 等扩展工具
    customTools: getNeezyCustomTools(),
    sessionManager,
    resourceLoader: await getResourceLoader(cwd, agentDir, settingsManager),
  })

  session.agent.toolExecution = "sequential"
  return session
}

export async function createAgentSession(
  window: BrowserWindow,
  options: CreateDiskAgentOptions = {}
): Promise<string> {
  const { sm, diskSessionId } = await resolveSessionManager(options)
  const existing = ipcSessions.get(diskSessionId)
  if (existing && !existing.window.isDestroyed()) {
    existing.window = window
    await bindAgentSessionUi(existing.session, window, diskSessionId)
    return diskSessionId
  }
  if (existing) {
    existing.unsubscribe()
    ipcSessions.delete(diskSessionId)
  }

  const session = await createPiSession(sm)
  syncSessionChatRoute(session)
  await bindAgentSessionUi(session, window, diskSessionId)
  void maybePromptChromeAuthorize(session, diskSessionId)

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    window.webContents.send("agent:event", { sessionId: diskSessionId, event })
  })

  ipcSessions.set(diskSessionId, {
    diskSessionId,
    session,
    unsubscribe,
    window,
  })
  return diskSessionId
}

/** 仅更新产品层 systemPrompt；对话正文由 SessionManager 持久化，勿再注入 messages。 */
export function configureAgentSession(
  diskSessionId: string,
  config: { systemPrompt: string }
): void {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) throw new Error("session not found")
  const loaderPrompt = entry.session.agent.state.systemPrompt?.trim()
  entry.session.agent.state.systemPrompt = loaderPrompt
    ? `${loaderPrompt}\n\n${config.systemPrompt}`
    : config.systemPrompt
  syncSessionChatRoute(entry.session)
}

function formatPromptError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message} (${cause.message})`
  }
  return error.message
}

async function ensureAgentChatReady(userMessage?: string): Promise<void> {
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute()
  if (!route.entry?.model.trim()) {
    const configured = normalizeMainChatModels(settings).length
    if (configured > 0) {
      throw new Error(
        "未配置对话模型。请在「模型与连接」添加并指定当前使用的模型。"
      )
    }
    throw new Error("请先在「模型与连接」添加至少一个已启用的对话模型")
  }
  const key = resolveEntryApiKey(route.entry, settings.llmProvider)
  if (!key) {
    throw new Error("该 API 模型未配置 Key，请在模型卡片中填写")
  }
}

export async function promptAgent(diskSessionId: string, message: string): Promise<void> {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) throw new Error("session not found")
  await ensureAgentChatReady(message)
  syncSessionChatRoute(entry.session, message)
  const model = entry.session.agent.state.model
  log.info(
    "[pi-agent] prompt",
    model.provider,
    model.id,
    model.api,
    model.baseUrl,
    "piSession",
    diskSessionId
  )
  try {
    await entry.session.prompt(message)
  } catch (error) {
    const msg = formatPromptError(error)
    log.error("[pi-agent] prompt failed:", msg, model.baseUrl, model.id)
    throw new Error(msg)
  }
}

export function abortAgentSession(diskSessionId: string): void {
  ipcSessions.get(diskSessionId)?.session.agent.abort()
}

export async function destroyAgentSession(diskSessionId: string): Promise<void> {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) return
  clearPermissionPromptsForSession(diskSessionId)
  entry.session.agent.abort()
  entry.unsubscribe()
  ipcSessions.delete(diskSessionId)
}

export function agentSessionExists(diskSessionId: string): boolean {
  return ipcSessions.has(diskSessionId)
}

export function getPiSessionsDirectory(): string {
  return getPiSessionsDir(app)
}

export { getPiAgentDir } from "./pi-agent-env"
export { resolvePermissionPrompt } from "./pi-permission-ui"
