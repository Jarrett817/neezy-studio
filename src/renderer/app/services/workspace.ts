import {
  getRuntimeMetrics as getElectronRuntimeMetrics,
  type RuntimeMetrics as ElectronRuntimeMetrics,
} from "~/services/electron-client"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
export { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"

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

export type RuntimeMetrics = ElectronRuntimeMetrics

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

// ==================== Workspace API ====================

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return {
    summary: {
      draftCount: 0,
      readyToPublishCount: 0,
      knowledgeCount: 0,
      weeklyPostCount: 0,
    },
    drafts: [],
    knowledge: [],
  }
}

// ==================== 运行时指标 ====================

export async function getRuntimeMetrics(): Promise<RuntimeMetrics> {
  return getElectronRuntimeMetrics()
}

// ==================== 知识库 (前端 memories.ts) ====================

export async function getRelevantKnowledge(
  _input: ContentAgentInput
): Promise<KnowledgePreview[]> {
  return []
}

export async function listKnowledgeItems(): Promise<KnowledgeItem[]> {
  return []
}

export async function saveKnowledgeItem(
  item: KnowledgeItem
): Promise<KnowledgeItem> {
  return item
}

export async function addKnowledgeItem(
  item: Omit<KnowledgeItem, "id">
): Promise<KnowledgeItem> {
  return item as KnowledgeItem
}

export async function deleteKnowledgeItem(_id: string): Promise<void> {}

export async function searchMemories(
  _query: string,
  _limit = 5
): Promise<KnowledgeItem[]> {
  return []
}

// ==================== Skills（多源目录安装） ====================

export async function listSkills(): Promise<AgentSkill[]> {
  const { listInstalledSkills } = await import("~/services/skills")
  const rows = await listInstalledSkills()
  return rows.map((skill) => ({
    id: skill.installKey,
    name: skill.name,
    description: skill.description.trim(),
    slug: skill.id,
    sourceKind: skill.publisher,
    instructions: "",
    prompt: "",
    enabled: true,
    fileCount: 1,
    hasScripts: false,
    hasReferences: false,
    hasAssets: false,
    updatedAt: String(skill.installedAt),
  }))
}

export async function saveSkill(skill: AgentSkill): Promise<AgentSkill> {
  return skill
}

export async function setSkillEnabled(
  id: string,
  _enabled: boolean
): Promise<AgentSkill> {
  const skills = await listSkills()
  const found = skills.find((s) => s.id === id)
  if (!found) throw new Error(`未找到 skill: ${id}`)
  return found
}

export async function importSkillArchive(_input: {
  archiveName: string
  archiveBase64: string
}): Promise<AgentSkill> {
  throw new Error("请从 Skill 目录页安装（Anthropic / Cursor 官方）")
}

export async function importSkillFolder(_input: {
  folderName: string
  files: SkillImportFile[]
}): Promise<AgentSkill> {
  throw new Error("请从 Skill 目录页安装（Anthropic / Cursor 官方）")
}

export async function deleteSkill(installKey: string): Promise<void> {
  const { uninstallSkill } = await import("~/services/skills")
  await uninstallSkill(installKey)
}

// ==================== 内存事件 ====================

export async function addMemoryEvent(_input: {
  layer: string
  content: string
  source?: string
}): Promise<void> {}

// ==================== 图片 ====================

export async function savePastedImage(_input: {
  fileName?: string
  mimeType: string
  bytesBase64: string
}): Promise<string> {
  return ""
}
