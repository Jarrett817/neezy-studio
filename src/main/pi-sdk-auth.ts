import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { Credential, CredentialStore } from "@earendil-works/pi-ai"

import { resolveEntryApiKey } from "./chat-model-entry"
import { resolveActiveChatRoute } from "./model-routing"
import { resolvePiChatModel } from "./pi-model"
import { getSyncedRuntimeSettings } from "./runtime-settings"

/** 不落盘 ~/.pi/auth.json，Key 只活在本次进程。 */
class MemoryCredentialStore implements CredentialStore {
  private data = new Map<string, Credential>()

  async read(providerId: string): Promise<Credential | undefined> {
    return this.data.get(providerId)
  }

  async list(): Promise<{ providerId: string; type: Credential["type"] }[]> {
    return [...this.data.entries()].map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }))
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    const next = await fn(this.data.get(providerId))
    if (next) this.data.set(providerId, next)
    return this.data.get(providerId)
  }

  async delete(providerId: string): Promise<void> {
    this.data.delete(providerId)
  }
}

let runtimePromise: Promise<ModelRuntime> | null = null

export function getPiModelRuntime(): Promise<ModelRuntime> {
  if (!runtimePromise) {
    runtimePromise = ModelRuntime.create({
      credentials: new MemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    })
  }
  return runtimePromise
}

/** 将 Neezy runtime_settings 同步到 Pi ModelRuntime（不落盘 ~/.pi） */
export async function syncPiAuthForRoute(userMessage?: string): Promise<void> {
  const runtime = await getPiModelRuntime()
  const settings = getSyncedRuntimeSettings()
  const route = resolveActiveChatRoute()
  const model = resolvePiChatModel(userMessage)
  const entry = route.entry
  if (!entry) return

  const key = resolveEntryApiKey(entry, settings.llmProvider)
  if (key) {
    await runtime.setRuntimeApiKey(model.provider, key)
  }
}
