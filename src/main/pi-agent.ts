import {
  createAgentSession as createPiAgentSession,
  DefaultResourceLoader,
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
import { getPiModelRuntime, syncPiAuthForRoute } from "./pi-sdk-auth"
import { resolveAgentThinkingLevel, resolvePiChatModel } from "./pi-model"
import { applyDashScopeAgentFixes } from "./dashscope-compat"
import { getSyncedRuntimeSettings } from "./runtime-settings"
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
import { resolveStoragePaths, resolveWorkspaceDir } from "./storage-paths"
import { readSoul } from "./soul-store"
import { SESSION_NAME_MAX_LENGTH } from "../shared/pi-session-dto"
import type { ContextUsageWire } from "../shared/chat-wire"
import { log } from "./logger"
import { listAllInstalledSkillDirs } from "./skill-install"
import { formatPromptError, sanitizePromptImages } from "./pi-agent-images"

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

/** 产品层 systemPrompt + soul，经 before_agent_start 写入 appendSystemPrompt（0.87+ systemPrompt 只读） */
const productAppendBySessionId = new Map<string, string>()

/** 同一陈旧 id 多次 agent:create 时复用已恢复的磁盘会话，避免疯狂新建 */
const staleDiskSessionRecovery = new Map<string, string>()

let resourceLoaderCache: { key: string; loader: ResourceLoader } | null = null
let bundledExtensionsLogged = false

export function invalidatePiResourceLoaderCache(): void {
  resourceLoaderCache = null
}

function getPiDirs() {
  const paths = resolveStoragePaths(app)
  return {
    cwd: resolveWorkspaceDir(app),
    agentDir: ensurePiAgentEnvironment(app),
    dataRoot: paths.dataRoot,
  }
}

function buildSettingsManager(cwd: string, agentDir: string): SettingsManager {
  const sm = SettingsManager.create(cwd, agentDir)
  const level = resolveAgentThinkingLevel(resolvePiChatModel())
  sm.applyOverrides({
    defaultThinkingLevel: level === "off" ? "off" : level,
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 3 },
  })
  return sm
}

function resolveAdditionalSkillPaths(dataRoot: string): string[] {
  return [...listAllInstalledSkillDirs(dataRoot), ...getBundledPiSkillPaths()]
}

async function getResourceLoader(
  cwd: string,
  agentDir: string,
  dataRoot: string,
  settingsManager: SettingsManager
): Promise<ResourceLoader> {
  const skillKey = listAllInstalledSkillDirs(dataRoot).sort().join(",")
  const key = `${cwd}\0${agentDir}\0${skillKey}\0product-prompt`
  if (resourceLoaderCache?.key === key) {
    return resourceLoaderCache.loader
  }

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: getBundledPiExtensionPaths(),
    additionalSkillPaths: resolveAdditionalSkillPaths(dataRoot),
    extensionFactories: [
      {
        name: "neezy-product-prompt",
        hidden: true,
        factory: (pi) => {
          pi.on("before_agent_start", (event, ctx) => {
            const append = productAppendBySessionId.get(ctx.sessionManager.getSessionId())
            if (!append) return
            const prev = event.systemPromptOptions.appendSystemPrompt.trim()
            event.systemPromptOptions.appendSystemPrompt = prev
              ? `${prev}\n\n${append}`
              : append
          })
        },
      },
    ],
  })
  await loader.reload()
  const ext = loader.getExtensions()
  for (const err of ext.errors) {
    log.warn("[pi-agent] extension load failed:", err.path, err.error)
  }
  const loaded = ext.extensions.map((e) => e.path)
  const hasPermissionSystem = loaded.some((p) => p.includes("pi-permission-system"))
  const hasWebAccess = loaded.some((p) => p.includes("pi-web-access"))
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
  // 勿传 createAgentSession({ tools })：该字段是 allowlist，会屏蔽扩展工具。
  // 不传时 SDK 默认激活 read/bash/edit/write；bindExtensions 会把新注册的扩展工具并入 active。
  await session.bindExtensions({
    uiContext: createElectronPermissionUi(window, diskSessionId),
  })
  log.info("[pi-agent] active tools:", session.getActiveToolNames().join(", "))
}

async function syncSessionChatRoute(session: AgentSession, userMessage?: string): Promise<void> {
  const model = resolvePiChatModel(userMessage)
  session.agent.state.model = model
  session.setThinkingLevel(resolveAgentThinkingLevel(model))
  applyDashScopeAgentFixes(session)
  await syncPiAuthForRoute(userMessage)
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
  const { cwd, agentDir, dataRoot } = getPiDirs()
  const model = resolvePiChatModel()
  const modelRuntime = await getPiModelRuntime()
  await syncPiAuthForRoute()
  const settingsManager = buildSettingsManager(cwd, agentDir)

  const { session } = await createPiAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    model: model as Model<Api>,
    thinkingLevel: resolveAgentThinkingLevel(model),
    settingsManager,
    // 与 CLI 默认一致；勿用 tools 白名单（会屏蔽扩展工具）
    excludeTools: ["grep", "find", "ls", "powershell"],
    customTools: getNeezyCustomTools(),
    sessionManager,
    resourceLoader: await getResourceLoader(cwd, agentDir, dataRoot, settingsManager),
  })

  session.agent.toolExecution = "parallel"
  applyDashScopeAgentFixes(session)
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
    await syncSessionChatRoute(existing.session)
    return diskSessionId
  }
  if (existing) {
    existing.unsubscribe()
    ipcSessions.delete(diskSessionId)
  }

  const session = await createPiSession(sm)
  await syncSessionChatRoute(session)
  await bindAgentSessionUi(session, window, diskSessionId)

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
export async function configureAgentSession(
  diskSessionId: string,
  config: { systemPrompt: string }
): Promise<void> {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) throw new Error("session not found")
  const soul = await readSoul()
  const parts = [
    config.systemPrompt.trim(),
    soul ? `【长期沉淀 soul.md】\n${soul}` : "",
  ].filter(Boolean)
  productAppendBySessionId.set(diskSessionId, parts.join("\n\n"))
  await syncSessionChatRoute(entry.session)
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

export async function promptAgent(
  diskSessionId: string,
  message: string,
  images?: unknown
): Promise<void> {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) throw new Error("session not found")
  await ensureAgentChatReady(message)
  await syncSessionChatRoute(entry.session, message)
  const model = entry.session.agent.state.model
  const safeImages = sanitizePromptImages(images)
  log.info(
    "[pi-agent] prompt",
    model.provider,
    model.id,
    model.api,
    model.baseUrl,
    "piSession",
    diskSessionId,
    safeImages ? `images=${safeImages.length}` : "images=0"
  )
  try {
    await entry.session.prompt(message, safeImages ? { images: safeImages } : undefined)
  } catch (error) {
    const msg = formatPromptError(error)
    log.error("[pi-agent] prompt failed:", msg, model.baseUrl, model.id)
    throw new Error(msg)
  }
}

export function abortAgentSession(diskSessionId: string): void {
  ipcSessions.get(diskSessionId)?.session.agent.abort()
}

export function getAgentContextUsage(diskSessionId: string): ContextUsageWire | null {
  const usage = ipcSessions.get(diskSessionId)?.session.getContextUsage()
  if (!usage) return null
  return {
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent,
  }
}

export function listAgentSkillCommands(
  diskSessionId: string
): Array<{ name: string; description: string }> {
  const skills = ipcSessions.get(diskSessionId)?.session.resourceLoader.getSkills().skills
  if (!skills) return []
  return skills
    .filter((skill) => skill.name.trim().length > 0)
    .map((skill) => ({ name: skill.name, description: skill.description }))
}

export async function renameAgentSession(diskSessionId: string, name: string): Promise<void> {
  const trimmed = name.trim().replace(/\s+/g, " ")
  if (!trimmed || trimmed.length > SESSION_NAME_MAX_LENGTH || /[\u0000-\u001f]/.test(trimmed)) {
    throw new Error("会话名称无效")
  }
  const live = ipcSessions.get(diskSessionId)
  if (live) {
    live.session.setSessionName(trimmed)
    return
  }
  const meta = await findPiSessionById(app, diskSessionId)
  if (!meta) throw new Error("session not found")
  openPiSessionManager(app, meta.path).appendSessionInfo(trimmed)
}

export async function destroyAgentSession(diskSessionId: string): Promise<void> {
  const entry = ipcSessions.get(diskSessionId)
  if (!entry) return
  clearPermissionPromptsForSession(diskSessionId)
  entry.session.agent.abort()
  entry.unsubscribe()
  ipcSessions.delete(diskSessionId)
  productAppendBySessionId.delete(diskSessionId)
}

export async function destroyAllAgentSessions(): Promise<void> {
  const ids = [...ipcSessions.keys()]
  for (const id of ids) {
    await destroyAgentSession(id)
  }
  invalidatePiResourceLoaderCache()
}

export function agentSessionExists(diskSessionId: string): boolean {
  return ipcSessions.has(diskSessionId)
}

export function getPiSessionsDirectory(): string {
  return getPiSessionsDir(app)
}

export { getPiAgentDir } from "./pi-agent-env"
export { resolvePermissionPrompt } from "./pi-permission-ui"
