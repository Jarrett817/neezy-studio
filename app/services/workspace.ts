import { invoke } from "@tauri-apps/api/core"

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

export type MetricPoint = {
  label: string
  views: number
  saves: number
}

export type WorkspaceSnapshot = {
  summary: DashboardSummary
  drafts: DraftPreview[]
  knowledge: KnowledgePreview[]
  metrics: MetricPoint[]
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
    modelPath?: string
    selectedBy?: "manual" | "auto"
    selectedReason?: string
    modelSuite?: {
      mode: "manual-single-model" | "auto-single-model" | "auto-suite"
      planner: string
      writer: string
      reviewer: string
    }
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

export type ModelConfig = {
  id: string
  label: string
  path: string
  paramsB: number
  quant: string
  sizeGb: number
  enabled: boolean
  capability?: "text" | "vision" | "embedding"
  repo?: string
  file?: string
  tokenizerRepo?: string
}

export type RuntimeSettings = {
  hfEndpoint: string
  preferLowPower: boolean
  maxCpuPercent: number
  models: ModelConfig[]
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

export type ModelDownloadOption = {
  id: string
  label: string
  paramsB: number
  quant: string
  sizeGb: number
  source: string
  url: string
  mirrorUrl: string
  repo: string
  note: string
  capability: "text" | "vision" | "embedding"
}

export type ModelDownloadSuite = {
  id: string
  label: string
  optionIds: string[]
  models: string[]
  note: string
}

export type ModelDownloadTask = {
  id: string
  optionId: string
  label: string
  targetPath: string
  downloadedBytes: number
  totalBytes?: number
  progress: number
  status: "running" | "done" | "failed"
  errorMessage?: string
}

export type KnowledgeItem = {
  id?: string
  title: string
  content: string
  category: string
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invoke<WorkspaceSnapshot>("get_workspace_snapshot")
}

export async function getRelevantKnowledge(
  input: ContentAgentInput
): Promise<KnowledgePreview[]> {
  return invoke<KnowledgePreview[]>("get_relevant_knowledge", { input })
}

export async function getAccountProfile(): Promise<AccountProfile> {
  return invoke<AccountProfile>("get_account_profile")
}

export async function saveAccountProfile(
  profile: AccountProfile
): Promise<AccountProfile> {
  return invoke<AccountProfile>("save_account_profile", { profile })
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  return invoke<RuntimeSettings>("get_runtime_settings")
}

export async function saveRuntimeSettings(
  settings: RuntimeSettings
): Promise<RuntimeSettings> {
  return invoke<RuntimeSettings>("save_runtime_settings", { settings })
}

export async function getRuntimeMetrics(): Promise<RuntimeMetrics> {
  return invoke<RuntimeMetrics>("get_runtime_metrics")
}

export async function getModelDownloadOptions(): Promise<
  ModelDownloadOption[]
> {
  return invoke<ModelDownloadOption[]>("get_model_download_options")
}

export async function getModelDownloadSuites(): Promise<ModelDownloadSuite[]> {
  return invoke<ModelDownloadSuite[]>("get_model_download_suites")
}

export async function startModelDownload(
  optionId: string
): Promise<ModelDownloadTask> {
  return invoke<ModelDownloadTask>("start_model_download", { optionId })
}

export async function startModelSuiteDownload(
  suiteId: string
): Promise<ModelDownloadTask[]> {
  return invoke<ModelDownloadTask[]>("start_model_suite_download", { suiteId })
}

export async function getModelDownloadTasks(): Promise<ModelDownloadTask[]> {
  return invoke<ModelDownloadTask[]>("get_model_download_tasks")
}

export async function addKnowledgeItem(input: {
  title: string
  content: string
  category: string
}): Promise<KnowledgeItem> {
  return invoke<KnowledgeItem>("add_knowledge_item", input)
}

export async function generateTextStream(input: {
  modelId?: string
  modelPath?: string
  messages: LlmMessage[]
  maxTokens?: number
  stream?: boolean
}): Promise<string> {
  return invoke<string>("generate_text_stream", { input })
}
