import { resolveCatalogBaseUrl } from "../shared/coding-plan-catalog"
import type { LlmProviderConfig, LlmProviderKind, ModelTier } from "./runtime-settings"

export interface ChatModelEntry {
  id: string
  label: string
  tier: ModelTier
  transport: LlmProviderKind
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
  const ollama = input.chatModels.filter(
    (e) => e.transport === "ollama" && e.enabled !== false && e.model?.trim()
  )
  const globalApi = input.llmProvider ?? {
    kind: "openai-compatible" as const,
    preset: "custom",
    baseUrl: "",
    apiKey: "",
    model: "",
  }
  const apis = input.chatModels.filter(
    (e) =>
      e.transport === "openai-compatible" &&
      e.enabled !== false &&
      e.model?.trim() &&
      resolveEntryApiKey(e, globalApi) &&
      resolveEntryApiBase(e, globalApi)
  )
  const singleOllama = ollama.length ? ollama[ollama.length - 1] : null
  return [...apis, ...(singleOllama ? [singleOllama] : [])]
}
