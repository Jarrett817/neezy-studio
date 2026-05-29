import {
  DEFAULT_APP_CONFIG,
  type AppConfig,
  type AppConfigChatModel,
} from "../../../shared/app-config"
import { configureOllamaHost, getAppConfig, saveAppConfig, syncRuntimeSettingsToMain } from "~/services/electron-client"
import {
  DEFAULT_LLM_PROVIDER,
  normalizeLlmProvider,
  type LlmProviderConfig,
} from "~/services/llm-provider"
import {
  enforceChatModelRules,
  isEntryConfigured,
  type ChatModelEntry,
  type ModelTier,
} from "~/config/chat-models"

export type { ModelTier } from "~/config/chat-models"
export type ChatTierMode = "fixed" | "auto"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  chatTier: ModelTier | ""
  ollamaHost: string
  llmProvider: LlmProviderConfig
  chatModels: ChatModelEntry[]
  chatTierMode: ChatTierMode
}

export type { ChatModelEntry } from "~/config/chat-models"

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: DEFAULT_APP_CONFIG.preferLowPower,
  maxCpuPercent: DEFAULT_APP_CONFIG.maxCpuPercent,
  chatTier: "",
  ollamaHost: DEFAULT_APP_CONFIG.ollamaHost,
  llmProvider: DEFAULT_LLM_PROVIDER,
  chatModels: [],
  chatTierMode: DEFAULT_APP_CONFIG.chatTierMode,
}

function appConfigToRuntime(config: AppConfig): RuntimeSettings {
  return {
    preferLowPower: config.preferLowPower,
    maxCpuPercent: config.maxCpuPercent,
    chatTier: config.chatTier,
    ollamaHost: config.ollamaHost,
    llmProvider: { ...DEFAULT_LLM_PROVIDER },
    chatModels: enforceChatModelRules(config.chatModels as ChatModelEntry[]),
    chatTierMode: config.chatTierMode,
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
    transport: e.transport,
    model: e.model,
    enabled: e.enabled,
    preset: e.preset,
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
  }))
  return {
    version: 1,
    dataRoot: current.dataRoot,
    preferLowPower: settings.preferLowPower,
    maxCpuPercent: settings.maxCpuPercent,
    ollamaHost: settings.ollamaHost.trim() || DEFAULT_APP_CONFIG.ollamaHost,
    chatTier: settings.chatTier,
    chatTierMode: settings.chatTierMode,
    chatModels,
  }
}

function mergeRuntimeSettings(stored: Partial<RuntimeSettings> | null): RuntimeSettings {
  const merged = { ...DEFAULT_SETTINGS, ...stored }
  const llmProvider = normalizeLlmProvider({
    ...DEFAULT_LLM_PROVIDER,
    ...(stored?.llmProvider ?? {}),
    kind: "openai-compatible",
  })
  const chatModels = enforceChatModelRules(stored?.chatModels ?? [])

  return {
    ...merged,
    llmProvider,
    chatTierMode:
      stored?.chatTierMode === "fixed" || stored?.chatTierMode === "auto"
        ? stored.chatTierMode
        : DEFAULT_SETTINGS.chatTierMode,
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
  if (merged.ollamaHost.trim()) {
    await configureOllamaHost(merged.ollamaHost.trim())
  }
  return mergeRuntimeSettings(appConfigToRuntime(saved))
}

export async function pushRuntimeSettingsToMain(): Promise<void> {
  const settings = await getRuntimeSettings()
  await syncRuntimeSettingsToMain({
    preferLowPower: settings.preferLowPower,
    maxCpuPercent: settings.maxCpuPercent,
    chatTier: settings.chatTier,
    ollamaHost: settings.ollamaHost,
    llmProvider: settings.llmProvider,
    chatModels: settings.chatModels,
    chatTierMode: settings.chatTierMode,
  })
}

export function pickTierForPrompt(message: string): ModelTier {
  const text = message.trim()
  const len = text.length
  if (len < 80) return "light"
  if (
    len < 500 &&
    !/分析|详细|复杂|架构|重构|代码|推理|长文|报告|方案/.test(text)
  ) {
    return "balanced"
  }
  return "performance"
}

export function resolveTierForChat(
  settings: RuntimeSettings,
  userMessage?: string
): ModelTier {
  if (settings.chatTierMode === "fixed" && settings.chatTier) {
    return settings.chatTier
  }
  if (userMessage?.trim()) return pickTierForPrompt(userMessage)
  return settings.chatTier || "balanced"
}

export function resolveChatModelEntry(
  settings: RuntimeSettings,
  userMessage?: string
): ChatModelEntry | null {
  const tier = resolveTierForChat(settings, userMessage)
  const configured = settings.chatModels.filter(
    (e) =>
      e.enabled &&
      e.model.trim() &&
      isEntryConfigured(e, settings.llmProvider)
  )
  if (!configured.length) return null

  const tierCandidates = configured.filter((e) => e.tier === tier)
  const candidates = tierCandidates.length ? tierCandidates : configured
  if (candidates.length === 1) return candidates[0]
  const seed = userMessage?.length ?? 0
  return candidates[seed % candidates.length] ?? candidates[0]
}

export function resolveActiveChatModelId(
  settings: RuntimeSettings,
  userMessage?: string
): string {
  return resolveChatModelEntry(settings, userMessage)?.model.trim() ?? ""
}
