import { nanoid } from "nanoid"

import { resolveCatalogBaseUrl } from "~/config/llm-presets"
import type { LlmProviderConfig, LlmProviderKind } from "~/services/llm-provider"
export type ModelTier = "light" | "balanced" | "performance"

/** 连接方式：Ollama 网关 vs OpenAI 兼容 HTTP（含各厂商 Coding Plan） */
export type ModelTransport = LlmProviderKind

export interface ChatModelEntry {
  id: string
  label: string
  tier: ModelTier
  transport: ModelTransport
  model: string
  enabled: boolean
  /** openai-compatible：Coding Plan 套餐 id 或 custom */
  preset?: string
  baseUrl?: string
  apiKey?: string
}

export function createChatModelEntry(
  partial: Omit<ChatModelEntry, "id" | "enabled" | "label"> & {
    id?: string
    label?: string
    enabled?: boolean
  }
): ChatModelEntry {
  return {
    id: partial.id ?? nanoid(12),
    label: partial.label?.trim() ?? "",
    enabled: partial.enabled !== false,
    tier: partial.tier,
    transport: partial.transport,
    model: partial.model.trim(),
    preset: partial.preset,
    baseUrl: partial.baseUrl?.trim(),
    apiKey: partial.apiKey,
  }
}

/** 全局仅保留一条 Ollama 配置；API 可多条 */
export function enforceChatModelRules(entries: ChatModelEntry[]): ChatModelEntry[] {
  const apis = entries
    .filter((e) => e.transport === "openai-compatible")
    .map((e) => ({
      ...e,
      id: e.id || nanoid(12),
      label: e.label ?? "",
      model: e.model?.trim() ?? "",
      enabled: e.enabled !== false,
    }))

  const ollamas = entries
    .filter((e) => e.transport === "ollama")
    .map((e) => ({
      ...e,
      id: e.id || nanoid(12),
      label: e.label ?? "",
      model: e.model?.trim() ?? "",
      enabled: e.enabled !== false,
    }))

  if (!ollamas.length) return apis

  const picked =
    ollamas.find((e) => e.enabled && e.model) ??
    ollamas.find((e) => e.model) ??
    ollamas[ollamas.length - 1]

  return [
    ...apis,
    {
      ...picked,
      enabled: Boolean(picked.model) && picked.enabled,
    },
  ]
}

export function normalizeChatModels(entries: ChatModelEntry[] | undefined): ChatModelEntry[] {
  if (!entries?.length) return []
  return enforceChatModelRules(entries)
}

export function resolveEntryApiBase(
  entry: ChatModelEntry,
  globalApi: LlmProviderConfig
): string {
  const preset = entry.preset ?? globalApi.preset
  const base = resolveCatalogBaseUrl(preset, entry.baseUrl ?? globalApi.baseUrl)
  return base.replace(/\/$/, "")
}

export function resolveEntryApiKey(
  entry: ChatModelEntry,
  globalApi: LlmProviderConfig
): string {
  return (entry.apiKey ?? globalApi.apiKey).trim()
}

export function entryDisplayName(entry: ChatModelEntry): string {
  if (entry.label.trim()) return entry.label.trim()
  if (entry.transport === "ollama") return entry.model
  const preset = entry.preset ?? "API"
  return `${entry.model} · ${preset}`
}

export function isEntryConfigured(
  entry: ChatModelEntry,
  globalApi: LlmProviderConfig
): boolean {
  if (!entry.enabled || !entry.model.trim()) return false
  if (entry.transport === "ollama") return true
  if (!resolveEntryApiKey(entry, globalApi)) return false
  return Boolean(resolveEntryApiBase(entry, globalApi))
}

export function findOllamaChatEntry(
  entries: ChatModelEntry[]
): ChatModelEntry | undefined {
  return entries.find((e) => e.transport === "ollama")
}
