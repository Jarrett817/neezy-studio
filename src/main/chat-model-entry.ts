import { resolveCatalogBaseUrl } from "../shared/coding-plan-catalog"
import type { LlmProviderConfig, ModelTier } from "./runtime-settings"

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

export function resolveEntryApiBase(
  entry: ChatModelEntry,
  globalApi: LlmProviderConfig
): string {
  const preset = entry.preset ?? globalApi.preset
  return resolveCatalogBaseUrl(preset, entry.baseUrl ?? globalApi.baseUrl).replace(/\/$/, "")
}

export function resolveEntryApiKey(
  entry: ChatModelEntry,
  globalApi: LlmProviderConfig
): string {
  return (entry.apiKey ?? globalApi.apiKey).trim()
}

export function normalizeMainChatModels(
  input: Partial<{ chatModels?: ChatModelEntry[]; llmProvider?: LlmProviderConfig }>
): ChatModelEntry[] {
  if (!input.chatModels?.length) return []
  const globalApi = input.llmProvider ?? {
    preset: "custom",
    baseUrl: "",
    apiKey: "",
    model: "",
  }
  return input.chatModels.filter(
    (e) =>
      e.enabled !== false &&
      e.model?.trim() &&
      resolveEntryApiKey(e, globalApi) &&
      resolveEntryApiBase(e, globalApi)
  )
}
