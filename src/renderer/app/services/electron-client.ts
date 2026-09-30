import { type BuildInfo, buildInfoSchema } from "~/schemas/bootstrap"
import type { ChatMessage } from "~/stores/app-store"
import type {
  AgentPermissionPolicy,
  AgentPermissionSettings,
  PermissionExtensionConfig,
} from "../../../shared/agent-permissions"
import type { AppConfig } from "../../../shared/app-config"
import type { ContextUsageWire } from "../../../shared/chat-wire"
import type {
  McpConfigSnapshot,
  McpServerDraft,
} from "../../../shared/mcp-config"
import type { ScheduledTask } from "../../../shared/scheduled-tasks"
import type { SessionInfoDto } from "../../../shared/pi-session-dto"
import type { SkillPublisherId } from "../../../shared/skill-registry"

export type ModelTier = "light" | "balanced" | "performance"
export type ModelKind = "chat" | "embedding"
export type CatalogSection = "recommended" | "local"

export type RuntimeMetrics = {
  cpuCount: number
  cpuUsagePercent: number
  totalMemoryGb: number
  availableMemoryGb: number
  pressure: "low" | "medium" | "high"
  gpuInspectLines?: string[]
}

type DirEntry = {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export type ModelCatalogItem = {
  id: string
  kind: ModelKind
  catalogSection?: CatalogSection
  tier: ModelTier
  tierLabel: string
  title: string
  subtitle: string
  description?: string
  modelUri?: string
  abilities?: string[]
  fileName: string
  sizeLabel: string
  sizeBytes: number
  minMemoryGb: number
  compatibilityScore?: number
  resolvedContextSize?: number
  embeddingDim?: number
  fit: string[]
  isLocalOnly?: boolean
  installed: boolean
  path: string | null
  status: "available" | "ready" | "downloading" | "error"
  progress: number | null
  downloadedBytes: number
  totalBytes: number
  cancellable?: boolean
}

export type ChatLoadPayload = {
  modelPath: string
  preferLowPower?: boolean
  systemPrompt?: string
  temperature?: number
  topK?: number
}

export type ModelLayerSplit = "cpu" | "gpu" | "mixed" | "auto"

export type ChatLoadResult = {
  modelPath: string
  contextSize: number
  preferLowPower: boolean
  fallbackCpu?: boolean
  gpuLayersOnGpu?: number
  totalLayers?: number
  layerSplit?: ModelLayerSplit
  requestedLayerSplit?: ModelLayerSplit
}

export type ChatPromptOptions = {
  temperature?: number
  topK?: number
  maxTokens?: number
}

export type ChatStreamPayload = {
  requestId: string
  input: string
  primeMessages?: ChatSyncMessage[]
  temperature?: number
  topK?: number
  maxTokens?: number
  useFunctions?: boolean
}

export type ChatStreamSegment = "thought" | "answer"

export type ChatStreamEvent = {
  requestId: string
  type: "start" | "chunk" | "done" | "error"
  /** 增量文本（主进程按 token 推送） */
  delta?: string
  segment?: ChatStreamSegment
  error?: string
}

export type ChatSyncMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type StoragePaths = {
  dataRoot: string
  workspaceDir: string
  workspaceCustomized: boolean
  modelsDir: string
  databaseFile: string
  memoriesDir: string
  personasDir: string
  skillsDir: string
  configFile: string
  defaultDataRoot: string
  defaultModelsDir: string
  isCustomized: boolean
}

export type StoragePathsSaveResult = StoragePaths & {
  migration?: {
    from: string
    to: string
    movedCount: number
  }
}

type ElectronApi = {
  getBuildInfo: () => Promise<BuildInfo>
  syncRuntimeSettings: (settings: Record<string, unknown>) => Promise<void>
  getAppConfig: () => Promise<AppConfig>
  saveAppConfig: (config: AppConfig) => Promise<AppConfig>
  testLlmConnection: () => Promise<{
    ok: boolean
    latencyMs: number
    error?: string
  }>
  listOpenAiModels: (payload: {
    baseUrl: string
    apiKey: string
  }) => Promise<{ ok: true; models: string[] } | { ok: false; error: string }>
  appDataDir: () => Promise<string>
  getStoragePaths: () => Promise<StoragePaths>
  saveStoragePaths: (input: {
    dataRoot: string
  }) => Promise<StoragePathsSaveResult>
  resetStoragePaths: () => Promise<StoragePathsSaveResult>
  saveWorkspaceDir: (workspaceDir: string | null) => Promise<StoragePaths>
  pickDirectory: (options?: {
    title?: string
    defaultPath?: string
  }) => Promise<string | null>
  join: (...parts: string[]) => Promise<string>
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  readTextFile: (path: string) => Promise<string>
  writeTextFile: (path: string, content: string) => Promise<void>
  remove: (path: string) => Promise<void>
  readDir: (path: string) => Promise<DirEntry[]>
  getAgentPermissionSettings: () => Promise<AgentPermissionSettings>
  saveAgentPermissionSettings: (input: {
    policy: AgentPermissionPolicy
    extension: PermissionExtensionConfig
  }) => Promise<AgentPermissionSettings>
  resetAgentPermissionSettings: () => Promise<AgentPermissionSettings>
  skillsListInstalled: () => Promise<
    Array<{
      id: string
      publisher: SkillPublisherId
      installKey: string
      name: string
      description: string
      skillDir: string
      installedAt: number
    }>
  >
  skillsUninstall: (installKey: string) => Promise<{ ok: true }>
  skillsImportFromPath: (sourcePath: string) => Promise<{
    id: string
    publisher: SkillPublisherId
    installKey: string
    name: string
    description: string
    skillDir: string
    installedAt: number
  }>
  getMcpConfig: () => Promise<McpConfigSnapshot>
  saveMcpConfig: (servers: McpServerDraft[]) => Promise<McpConfigSnapshot>
  tasksList: () => Promise<ScheduledTask[]>
  tasksUpsert: (task: ScheduledTask) => Promise<ScheduledTask[]>
  tasksRemove: (id: string) => Promise<ScheduledTask[]>
  tasksRunNow: (id: string) => Promise<void>
  getPathForFile: (file: File) => string

  // Agent
  agentCreate: (options?: {
    diskSessionId?: string
    createNew?: boolean
    sceneSkillIds?: string[]
  }) => Promise<string>
  agentConfigure: (payload: {
    sessionId: string
    systemPrompt: string
  }) => Promise<{ ok: boolean }>
  agentPrompt: (payload: {
    sessionId: string
    message: string
    images?: unknown
  }) => Promise<{ ok: boolean }>
  agentAbort: (sessionId: string) => Promise<{ ok: boolean }>
  agentDestroy: (sessionId: string) => Promise<{ ok: boolean }>
  agentContextUsage: (sessionId: string) => Promise<ContextUsageWire | null>
  agentSkillCommands: (
    sessionId: string
  ) => Promise<Array<{ name: string; description: string }>>
  agentPermissionRespond: (payload: {
    sessionId: string
    requestId: string
    action?: string
    value?: string
  }) => Promise<void>

  // Pi sessions
  piSessionsGetDir: () => Promise<string>
  piSessionsList: () => Promise<SessionInfoDto[]>
  piSessionsListWithMessages: () => Promise<SessionInfoDto[]>
  piSessionsCreate: () => Promise<SessionInfoDto>
  piSessionsLoadMessages: (sessionId: string) => Promise<ChatMessage[]>
  piSessionsRename: (payload: {
    sessionId: string
    name: string
  }) => Promise<void>
  piSessionsDelete: (sessionId: string) => Promise<void>
  piSessionsPruneEmpty: (keepSessionId?: string | null) => Promise<number>

  // 事件订阅（返回取消订阅函数）
  onAgentEvent: (handler: (payload: unknown) => void) => () => void
  onAgentPermissionPrompt: (handler: (payload: unknown) => void) => () => void
  onAgentPermissionNotify: (handler: (payload: unknown) => void) => () => void
  onTasksChanged: (handler: () => void) => () => void
  onTasksSessionComplete: (
    handler: (payload: { sessionId: string }) => void
  ) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronApi
  }
}

export function getElectronApi(): ElectronApi {
  if (typeof window === "undefined" || !window.electronAPI) {
    throw new Error(
      "Electron API 不可用。请使用 bun run electron:dev 启动桌面应用，不要单独打开浏览器访问 localhost。"
    )
  }
  return window.electronAPI
}

export async function getBuildInfo(): Promise<BuildInfo> {
  return buildInfoSchema.parse(await getElectronApi().getBuildInfo())
}

export async function syncRuntimeSettingsToMain(
  settings: Record<string, unknown>
): Promise<void> {
  await getElectronApi().syncRuntimeSettings(settings)
}

export async function getAppConfig(): Promise<AppConfig> {
  return getElectronApi().getAppConfig()
}

export async function saveAppConfig(config: AppConfig): Promise<AppConfig> {
  return getElectronApi().saveAppConfig(config)
}

export async function testLlmConnection(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
  return getElectronApi().testLlmConnection()
}

export async function listOpenAiModels(payload: {
  baseUrl: string
  apiKey: string
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  return getElectronApi().listOpenAiModels(payload)
}

/** 渲染进程在 Electron 壳内（有 electronAPI） */
export function isElectronApp(): boolean {
  return typeof window !== "undefined" && window.electronAPI != null
}

export async function appDataDir(): Promise<string> {
  return getElectronApi().appDataDir()
}

export async function getStoragePaths(): Promise<StoragePaths> {
  return getElectronApi().getStoragePaths()
}

export async function saveStoragePaths(input: {
  dataRoot: string
}): Promise<StoragePathsSaveResult> {
  return getElectronApi().saveStoragePaths(input)
}

export async function resetStoragePaths(): Promise<StoragePathsSaveResult> {
  return getElectronApi().resetStoragePaths()
}

export async function saveWorkspaceDir(
  workspaceDir: string | null
): Promise<StoragePaths> {
  return getElectronApi().saveWorkspaceDir(workspaceDir)
}

export async function pickDirectory(options?: {
  title?: string
  defaultPath?: string
}): Promise<string | null> {
  return getElectronApi().pickDirectory(options)
}

export async function join(...parts: string[]): Promise<string> {
  return getElectronApi().join(...parts)
}

export async function exists(path: string): Promise<boolean> {
  return getElectronApi().exists(path)
}

export async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  await getElectronApi().mkdir(path, options)
}

export async function readTextFile(path: string): Promise<string> {
  return getElectronApi().readTextFile(path)
}

export async function writeTextFile(
  path: string,
  content: string
): Promise<void> {
  await getElectronApi().writeTextFile(path, content)
}

export async function remove(path: string): Promise<void> {
  await getElectronApi().remove(path)
}

export async function readDir(path: string): Promise<DirEntry[]> {
  return getElectronApi().readDir(path)
}
