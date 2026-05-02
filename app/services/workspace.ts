import { invokeTauri } from "~/services/tauri-client"
import ollama, { type ChatResponse, type Message } from "ollama/browser"

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

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  ollamaModel?: string
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

// ==================== Workspace API ====================

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invokeTauri<WorkspaceSnapshot>("get_workspace_snapshot")
}

export async function getAccountProfile(): Promise<AccountProfile> {
  return invokeTauri<AccountProfile>("get_account_profile")
}

export async function saveAccountProfile(profile: AccountProfile): Promise<AccountProfile> {
  return invokeTauri<AccountProfile>("save_account_profile", { profile })
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  return invokeTauri<RuntimeSettings>("get_runtime_settings")
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettings> {
  return invokeTauri<RuntimeSettings>("save_runtime_settings", { settings })
}

export async function getRuntimeMetrics(): Promise<RuntimeMetrics> {
  return invokeTauri<RuntimeMetrics>("get_runtime_metrics")
}

// ==================== 知识库 ====================

export async function getRelevantKnowledge(input: ContentAgentInput): Promise<KnowledgePreview[]> {
  return invokeTauri<KnowledgePreview[]>("get_relevant_knowledge", { input })
}

export async function listKnowledgeItems(): Promise<KnowledgeItem[]> {
  return invokeTauri<KnowledgeItem[]>("list_knowledge_items")
}

export async function saveKnowledgeItem(item: KnowledgeItem): Promise<KnowledgeItem> {
  return invokeTauri<KnowledgeItem>("save_knowledge_item", { item })
}

export async function addKnowledgeItem(item: Omit<KnowledgeItem, "id">): Promise<KnowledgeItem> {
  return invokeTauri<KnowledgeItem>("save_knowledge_item", { item: { ...item, id: undefined } })
}

export async function deleteKnowledgeItem(id: string): Promise<void> {
  return invokeTauri<void>("delete_knowledge_item", { id })
}

// ==================== Skills ====================

export async function listSkills(): Promise<AgentSkill[]> {
  return invokeTauri<AgentSkill[]>("list_skills")
}

export async function saveSkill(skill: AgentSkill): Promise<AgentSkill> {
  return invokeTauri<AgentSkill>("save_skill", { skill })
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<AgentSkill> {
  return invokeTauri<AgentSkill>("set_skill_enabled", { id, enabled })
}

export async function importSkillArchive(input: {
  archiveName: string
  archiveBase64: string
}): Promise<AgentSkill> {
  return invokeTauri<AgentSkill>("import_skill_archive", input)
}

export async function importSkillFolder(input: {
  folderName: string
  files: SkillImportFile[]
}): Promise<AgentSkill> {
  return invokeTauri<AgentSkill>("import_skill_folder", input)
}

export async function deleteSkill(id: string): Promise<void> {
  return invokeTauri<void>("delete_skill", { id })
}

// ==================== 内存事件 ====================

export async function addMemoryEvent(input: {
  layer: string
  content: string
  source?: string
}): Promise<void> {
  return invokeTauri<void>("add_memory_event", { input })
}

// ==================== 图片 ====================

export async function savePastedImage(input: {
  fileName?: string
  mimeType: string
  bytesBase64: string
}): Promise<string> {
  return invokeTauri<string>("save_pasted_image", { input })
}

// ==================== Ollama 进程管理 ====================

export async function ensureOllamaRunning(): Promise<void> {
  return invokeTauri<void>("ensure_ollama_running")
}

export async function isOllamaRunning(): Promise<boolean> {
  return invokeTauri<boolean>("is_ollama_running")
}

export async function stopOllama(): Promise<void> {
  return invokeTauri<void>("stop_ollama")
}

export async function getOllamaHost(): Promise<string> {
  return invokeTauri<string>("get_ollama_host")
}

// ==================== Ollama 模型管理（使用 ollama/browser） ====================

export type OllamaModel = Awaited<ReturnType<typeof ollama.list>>["models"][number]

export type ProgressResponse = {
  status: string
  digest: string
  total: number
  completed: number
}

// 列出已下载的模型
export async function listOllamaModels(): Promise<OllamaModel[]> {
  const response = await ollama.list()
  return response.models || []
}

// 拉取模型（流式进度）
export async function pullOllamaModel(
  modelName: string,
  onProgress?: (progress: ProgressResponse) => void
): Promise<void> {
  const response = await ollama.pull({ model: modelName, stream: true })
  for await (const part of response) {
    onProgress?.(part as ProgressResponse)
  }
}

// 删除模型
export async function deleteOllamaModel(modelName: string): Promise<void> {
  await ollama.delete({ model: modelName })
}

// 获取模型信息
export async function showOllamaModel(modelName: string): Promise<Awaited<ReturnType<typeof ollama.show>>> {
  return ollama.show({ model: modelName })
}

// 生成文本（流式）
export async function generateWithOllama(options: {
  model: string
  prompt: string
  system?: string
  temperature?: number
  maxTokens?: number
  onChunk?: (text: string) => void
}): Promise<string> {
  const response = await ollama.generate({
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 1024,
    },
  })
  let result = ""
  for await (const part of response) {
    result += part.response
    options.onChunk?.(part.response)
  }
  return result
}

// 聊天补全（流式，使用回调实时输出）
export async function chatWithOllama(options: {
  model: string
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
  onChunk?: (content: string, thinking: string) => void
}): Promise<{ content: string; thinking: string }> {
  const response = await ollama.chat({
    model: options.model,
    messages: options.messages as ChatResponse["message"]["role"][],
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 1024,
    },
  })
  let content = ""
  let thinking = ""
  for await (const part of response) {
    // ChatResponse.message.content 是实际回复文本
    // ChatResponse.message.thinking 是 qwen3 等模型的思考过程
    const chunk = part.message.content || ""
    const chunkThinking = part.message.thinking || ""
    if (chunk) {
      content += chunk
    }
    if (chunkThinking) {
      thinking += chunkThinking
    }
    if (chunk || chunkThinking) {
      options.onChunk?.(content, thinking)
    }
  }
  return { content, thinking }
}

// 获取 embedding
export async function getOllamaEmbedding(options: {
  model: string
  prompt: string
}): Promise<number[]> {
  const response = await ollama.embeddings({
    model: options.model,
    prompt: options.prompt,
  })
  return response.embedding
}
