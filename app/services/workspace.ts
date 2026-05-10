import { invokeTauri } from "~/services/tauri-client"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
import { getPersona, savePersona } from "./storage/persona"
export type { OllamaModel, ProgressResponse } from "./ollama"
export {
  getOllamaHost,
  listOllamaModels,
  pullOllamaModel,
  deleteOllamaModel,
  showOllamaModel,
  generateText,
  chat,
  getEmbeddings,
  chat as chatWithOllama, // 别名兼容旧代码
} from "./ollama"
export { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
export { isOllamaRunning } from "~/services/shell"

export type DashboardSummary = {
  draftCount: number
  readyToPublishCount: number
  knowledgeCount: number
  weeklyPostCount: number
}

export type DraftPreview = {
  id: string
  title: string
  status: "draft" | "review" | "published"
  updatedAt: string
}

export type KnowledgePreview = {
  id: string
  title: string
  category: string
  content: string
  lastUsedAt: string
}

export type WorkspaceSnapshot = {
  summary: DashboardSummary
  drafts: DraftPreview[]
  knowledge: KnowledgePreview[]
}

export type AccountProfile = {
  accountName: string
  track: string
  persona: string
  toneStyle: string
  forbiddenWords: string
}

export type ContentAgentInput = {
  topic: string
  goal: string
  references: string
  modelPath?: string
  modelId?: string
  imagePath?: string
}

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool" | string
  content: string
}

export type ContentAgentOutput = {
  title: string
  body: string
  tags: string[]
  trace: {
    modelId?: string
    modelLabel?: string
    selectedBy?: "manual" | "auto"
    selectedReason?: string
    knowledgeUsed?: number
    totalKnowledge?: number
    skills?: string[]
    runtime?: RuntimePlan
    elapsedMs?: number
    stages?: string[]
  }
}

export type RuntimePlan = {
  maxThreads: number
  contextSize: number
  batchSize: number
  gpu: "auto" | false
  cpuLimitPercent: number
  pressure: "low" | "medium" | "high"
}

export type RuntimeMetrics = {
  cpuCount: number
  cpuUsagePercent: number
  totalMemoryGb: number
  availableMemoryGb: number
  pressure: "low" | "medium" | "high"
  recommendedModelId?: string
  recommendedReason: string
}

export type KnowledgeItem = {
  id?: string
  title: string
  content: string
  category: string
  updatedAt?: string
}

export type AgentSkill = {
  id: string
  name: string
  description: string
  slug: string
  sourceKind: string
  rootPath?: string
  skillMdPath?: string
  instructions: string
  prompt: string
  enabled: boolean
  fileCount: number
  hasScripts: boolean
  hasReferences: boolean
  hasAssets: boolean
  updatedAt?: string
}

export type SkillImportFile = {
  relativePath: string
  bytesBase64: string
}

export type AgentExecutionStep = {
  key: string
  label: string
  detail: string
  status: "pending" | "running" | "done" | "skipped" | "error"
  elapsedMs?: number
}

// ==================== Workspace API (stubbed - 前端直接管理) ====================

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return {
    summary: { draftCount: 0, readyToPublishCount: 0, knowledgeCount: 0, weeklyPostCount: 0 },
    drafts: [],
    knowledge: []
  }
}

export async function getAccountProfile(): Promise<AccountProfile> {
  const persona = await getPersona()
  return {
    accountName: persona.accountName,
    track: persona.track,
    persona: persona.persona,
    toneStyle: persona.toneStyle,
    forbiddenWords: persona.forbiddenWords,
  }
}

export async function saveAccountProfile(profile: AccountProfile): Promise<AccountProfile> {
  await savePersona({
    accountName: profile.accountName,
    track: profile.track,
    persona: profile.persona,
    toneStyle: profile.toneStyle,
    forbiddenWords: profile.forbiddenWords,
  })
  return profile
}

// ==================== 运行时指标（Rust 计算） ====================

export async function getRuntimeMetrics(): Promise<RuntimeMetrics> {
  return invokeTauri<RuntimeMetrics>("get_runtime_metrics")
}

// ==================== 知识库 (已移至前端 memories.ts) ====================

export async function getRelevantKnowledge(_input: ContentAgentInput): Promise<KnowledgePreview[]> {
  return []
}

export async function listKnowledgeItems(): Promise<KnowledgeItem[]> {
  return []
}

export async function saveKnowledgeItem(item: KnowledgeItem): Promise<KnowledgeItem> {
  return item
}

export async function addKnowledgeItem(item: Omit<KnowledgeItem, "id">): Promise<KnowledgeItem> {
  return item as KnowledgeItem
}

export async function deleteKnowledgeItem(_id: string): Promise<void> {
  // 前端通过 memories.ts 处理
}

export async function getMemoriesDir(): Promise<string> {
  const { appDataDir, join } = await import("@tauri-apps/api/path")
  const baseDir = await appDataDir()
  return join(baseDir, "memories")
}

export async function searchMemories(_query: string, _limit = 5): Promise<KnowledgeItem[]> {
  return []
}

// ==================== Skills (stubbed) ====================

export async function listSkills(): Promise<AgentSkill[]> {
  return []
}

export async function saveSkill(skill: AgentSkill): Promise<AgentSkill> {
  return skill
}

export async function setSkillEnabled(id: string, _enabled: boolean): Promise<AgentSkill> {
  return { id } as AgentSkill
}

export async function importSkillArchive(_input: { archiveName: string; archiveBase64: string }): Promise<AgentSkill> {
  return {} as AgentSkill
}

export async function importSkillFolder(_input: { folderName: string; files: SkillImportFile[] }): Promise<AgentSkill> {
  return {} as AgentSkill
}

export async function deleteSkill(_id: string): Promise<void> {}

// ==================== 内存事件 (stubbed) ====================

export async function addMemoryEvent(_input: { layer: string; content: string; source?: string }): Promise<void> {}

// ==================== 图片 (stubbed) ====================

export async function savePastedImage(_input: { fileName?: string; mimeType: string; bytesBase64: string }): Promise<string> {
  return ""
}

// ==================== Ollama 进程管理（已移至前端 shell.ts） ====================

export async function ensureOllamaRunning(): Promise<void> {
  const { ensureOllamaRunning: ensure } = await import("~/services/shell")
  return ensure()
}

export async function stopOllama(): Promise<void> {
  const { stopOllama: stop } = await import("~/services/shell")
  return stop()
}
