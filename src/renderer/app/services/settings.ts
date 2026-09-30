import {
  type ChatModelEntry,
  enforceChatModelRules,
  isEntryConfigured,
} from "~/config/chat-models"
import {
  getAppConfig,
  saveAppConfig,
  syncRuntimeSettingsToMain,
} from "~/services/electron-client"
import {
  DEFAULT_LLM_PROVIDER,
  type LlmProviderConfig,
  normalizeLlmProvider,
} from "~/services/llm-provider"
import {
  type AgentThinkingLevelSetting,
  type AppConfig,
  type AppConfigChatModel,
  DEFAULT_APP_CONFIG,
  normalizeAgentThinkingLevel,
} from "../../../shared/app-config"

export type { ModelTier } from "~/config/chat-models"
export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  agentThinkingLevel: AgentThinkingLevelSetting
  activeChatModelId: string
  llmProvider: LlmProviderConfig
  chatModels: ChatModelEntry[]
}

export type { ChatModelEntry } from "~/config/chat-models"
export type { AgentThinkingLevelSetting } from "../../../shared/app-config"

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: DEFAULT_APP_CONFIG.preferLowPower,
  maxCpuPercent: DEFAULT_APP_CONFIG.maxCpuPercent,
  agentThinkingLevel: DEFAULT_APP_CONFIG.agentThinkingLevel,
  activeChatModelId: "",
  llmProvider: DEFAULT_LLM_PROVIDER,
  chatModels: [],
}

function appConfigToRuntime(config: AppConfig): RuntimeSettings {
  return {
    preferLowPower: config.preferLowPower,
    maxCpuPercent: config.maxCpuPercent,
    agentThinkingLevel: normalizeAgentThinkingLevel(config.agentThinkingLevel),
    activeChatModelId: config.activeChatModelId?.trim() ?? "",
    llmProvider: { ...DEFAULT_LLM_PROVIDER },
    chatModels: enforceChatModelRules(config.chatModels as ChatModelEntry[]),
  }
}

function runtimeToAppConfig(
  settings: RuntimeSettings,
  current: AppConfig
): AppConfig {
  const chatModels: AppConfigChatModel[] = settings.chatModels.map((e) => ({
    id: e.id,
    label: e.label,
    tier: e.tier,
    model: e.model,
    enabled: e.enabled,
    preset: e.preset,
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
    contextWindow: e.contextWindow,
  }))
  return {
    version: 1,
    workspaceDir: current.workspaceDir,
    preferLowPower: settings.preferLowPower,
    maxCpuPercent: settings.maxCpuPercent,
    agentThinkingLevel: normalizeAgentThinkingLevel(
      settings.agentThinkingLevel
    ),
    activeChatModelId: settings.activeChatModelId.trim(),
    chatModels,
  }
}

function mergeRuntimeSettings(
  stored: Partial<RuntimeSettings> | null
): RuntimeSettings {
  const merged = { ...DEFAULT_SETTINGS, ...stored }
  const llmProvider = normalizeLlmProvider(
    stored?.llmProvider ?? merged.llmProvider
  )
  const chatModels = enforceChatModelRules(stored?.chatModels ?? [])

  return {
    ...merged,
    llmProvider,
    agentThinkingLevel: normalizeAgentThinkingLevel(
      stored?.agentThinkingLevel ?? merged.agentThinkingLevel
    ),
    activeChatModelId: stored?.activeChatModelId?.trim() ?? "",
    chatModels,
  }
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const config = await getAppConfig()
  return mergeRuntimeSettings(appConfigToRuntime(config))
}

export async function saveRuntimeSettings(
  settings: RuntimeSettings
): Promise<RuntimeSettings> {
  const current = await getAppConfig()
  const merged = mergeRuntimeSettings(settings)
  const saved = await saveAppConfig(runtimeToAppConfig(merged, current))
  return mergeRuntimeSettings(appConfigToRuntime(saved))
}

export async function pushRuntimeSettingsToMain(): Promise<void> {
  const settings = await getRuntimeSettings()
  await syncRuntimeSettingsToMain({
    preferLowPower: settings.preferLowPower,
    maxCpuPercent: settings.maxCpuPercent,
    agentThinkingLevel: settings.agentThinkingLevel,
    activeChatModelId: settings.activeChatModelId,
    llmProvider: settings.llmProvider,
    chatModels: settings.chatModels,
  })
}

export function listConfiguredChatModels(
  settings: RuntimeSettings
): ChatModelEntry[] {
  return settings.chatModels.filter(
    (e) =>
      e.enabled && e.model.trim() && isEntryConfigured(e, settings.llmProvider)
  )
}

export function resolveChatModelEntry(
  settings: RuntimeSettings
): ChatModelEntry | null {
  const configured = listConfiguredChatModels(settings)
  if (!configured.length) return null

  const activeId = settings.activeChatModelId.trim()
  if (activeId) {
    const found = configured.find((e) => e.id === activeId)
    if (found) return found
  }
  return configured[0]
}

export function resolveActiveChatModelId(settings: RuntimeSettings): string {
  return resolveChatModelEntry(settings)?.model.trim() ?? ""
}
