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

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invoke<WorkspaceSnapshot>("get_workspace_snapshot")
}

export async function getAccountProfile(): Promise<AccountProfile> {
  return invoke<AccountProfile>("get_account_profile")
}

export async function saveAccountProfile(
  profile: AccountProfile
): Promise<AccountProfile> {
  return invoke<AccountProfile>("save_account_profile", { profile })
}
