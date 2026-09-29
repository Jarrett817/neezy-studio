import type { Api } from "@earendil-works/pi-ai"
import { InMemoryCredentialStore } from "@earendil-works/pi-ai"
import { getBuiltinProviders } from "@earendil-works/pi-ai/providers/all"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"

import { resolveEntryApiKey } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import { resolvePiChatModel } from "./pi-model"
import { getSyncedRuntimeSettings } from "./runtime-settings"

let runtimePromise: Promise<ModelRuntime> | null = null

export function getPiModelRuntime(): Promise<ModelRuntime> {
  if (!runtimePromise) {
    runtimePromise = ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    })
  }
  return runtimePromise
}

function isBuiltinProvider(providerId: string): boolean {
  return (getBuiltinProviders() as readonly string[]).includes(providerId)
}

/** 将 Neezy runtime_settings 同步到 Pi ModelRuntime（不落盘 ~/.pi） */
export async function syncPiAuthForRoute(userMessage?: string): Promise<void> {
  const runtime = await getPiModelRuntime()
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute()
  const entry = route.entry
  if (!entry) return

  const model = resolvePiChatModel(userMessage)
  const key = resolveEntryApiKey(entry, settings.llmProvider)
  if (!key) return

  // openai-compatible 等非内置 provider：须 registerProvider，否则 hasConfiguredAuth 恒为 false
  if (!isBuiltinProvider(model.provider)) {
    runtime.registerProvider(model.provider, {
      baseUrl: model.baseUrl,
      api: model.api as Api,
      apiKey: key,
      models: [
        {
          id: model.id,
          name: model.name || model.id,
          reasoning: model.reasoning,
          input: [...model.input],
          cost: model.cost,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          ...(model.compat ? { compat: model.compat } : {}),
        },
      ],
    })
  }

  await runtime.setRuntimeApiKey(model.provider, key)
}
