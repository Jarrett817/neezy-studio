import { nanoid } from "nanoid"

import { resolveCatalogBaseUrl } from "~/config/llm-presets"
import type { LlmProviderConfig } from "~/services/llm-provider"

export type ModelTier = "light" | "balanced" | "performance"

export interface ChatModelEntry {
  id: string
  label: string
  tier: ModelTier
  model: string
  enabled: boolean
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
    model: partial.model.trim(),
    preset: partial.preset,
    baseUrl: partial.baseUrl?.trim(),
    apiKey: partial.apiKey,
  }
}

export function enforceChatModelRules(entries: ChatModelEntry[]): ChatModelEntry[] {
  return entries.map((e) => ({
    ...e,
    id: e.id || nanoid(12),
    label: e.label ?? "",
    model: e.model?.trim() ?? "",
    enabled: e.enabled !== false,
  }))
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
  const preset = entry.preset ?? "API"
  return `${entry.model} · ${preset}`
}

export function isEntryConfigured(
  entry: ChatModelEntry,
  globalApi: LlmProviderConfig
): boolean {
  if (!entry.enabled || !entry.model.trim()) return false
  if (!resolveEntryApiKey(entry, globalApi)) return false
  return Boolean(resolveEntryApiBase(entry, globalApi))
}
