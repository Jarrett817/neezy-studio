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
import path from "node:path"

import { ensureOllamaReady } from "./ollama/lifecycle"
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
import { getNeezyCustomTools } from "./pi-tool-registry"
import {
  getBundledPiExtensionPaths,
  getBundledPiSkillPaths,
} from "./pi-bundled-extensions"
import { resolveStoragePaths } from "./storage-paths"
import { log } from "./logger"

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

let resourceLoaderCache: { key: string; loader: ResourceLoader } | null = null
let bundledExtensionsLogged = false

let modelRegistry: ModelRegistry | null = null

function getModelRegistry(): ModelRegistry {
  if (!modelRegistry) {
    modelRegistry = ModelRegistry.inMemory(getPiAuthStorage())
  }
  return modelRegistry
}

function getPiDirs() {
  const paths = resolveStoragePaths(app)
  return { cwd: paths.dataRoot, agentDir: path.join(app.getPath("userData"), "pi-agent") }
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

async function getResourceLoader(
  cwd: string,
  agentDir: string,
  settingsManager: SettingsManager
): Promise<ResourceLoader> {
  const key = `${cwd}\0${agentDir}`
  if (resourceLoaderCache?.key === key) {
    return resourceLoaderCache.loader
  }

  const skillsDir = path.join(cwd, "skills")
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: getBundledPiExtensionPaths(),
    additionalSkillPaths: [skillsDir, ...getBundledPiSkillPaths()],
  })
  await loader.reload()
  const ext = loader.getExtensions()
  if (ext.errors.length > 0) {
    log.warn("[pi-agent] bundled extension errors:", ext.errors)
  }
  if (!bundledExtensionsLogged && ext.extensions.length > 0) {
    bundledExtensionsLogged = true
    log.info(
      "[pi-agent] bundled extensions:",
      ext.extensions.map((e) => e.path).join(", ")
    )
  }
  resourceLoaderCache = { key, loader }
  return loader
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

    log.warn("[pi-agent] 磁盘会话缺失，已恢复新建:", options.diskSessionId)
    const sm = createPiSessionManager(app)
    const newId = sm.getSessionId()
    staleDiskSessionRecovery.set(options.diskSessionId, newId)
    return { sm, diskSessionId: newId }
  }
  throw new Error("缺少 diskSessionId，请先创建或选择 Pi 磁盘会话")
}

async function createPiSession(sessionManager: SessionManager): Promise<AgentSession> {
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
    return diskSessionId
  }
  if (existing) {
    existing.unsubscribe()
    ipcSessions.delete(diskSessionId)
  }

  const session = await createPiSession(sm)
  syncSessionChatRoute(session)

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    window.webContents.send("agent:event", { sessionId: diskSessionId, event })
  })

  ipcSessions.set(diskSessionId, { diskSessionId, session, unsubscribe, window })
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

async function ensureAgentChatReady(userMessage?: string): Promise<void> {
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute(userMessage)
  if (!route.entry?.model.trim()) {
    const configured = normalizeMainChatModels(settings).length
    if (configured > 0) {
      throw new Error(
        "当前消息档位下没有可用模型。请在「模型与连接」为各档位添加模型，或改为固定档位。"
      )
    }
    throw new Error("请先在「模型与连接」添加至少一个已启用的对话模型")
  }
  if (route.entry.transport === "openai-compatible") {
    const key = resolveEntryApiKey(route.entry, settings.llmProvider)
    if (!key) {
      throw new Error("该 API 模型未配置 Key，请在模型卡片或 API 默认项中填写")
    }
    return
  }
  await ensureOllamaReady()
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
    const msg = error instanceof Error ? error.message : String(error)
    log.error("[pi-agent] prompt failed:", msg)
    throw new Error(msg)
  }
}

export function abortAgentSession(diskSessionId: string): void {
  ipcSessions.get(diskSessionId)?.session.agent.abort()
}

export async function destroyAgentSession(diskSessionId: string): Promise<void> {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) return
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
