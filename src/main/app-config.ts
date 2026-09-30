import fsSync from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import type { App } from "electron"

import {
  APP_CONFIG_VERSION,
  type AppConfig,
  DEFAULT_APP_CONFIG,
  normalizeAgentThinkingLevel,
} from "../shared/app-config"

export const CONFIG_FILE = "app-config.json"

export function getAppConfigPath(app: App): string {
  return path.join(app.getPath("userData"), CONFIG_FILE)
}

function normalizeWorkspaceDir(value: string | undefined): string {
  if (!value?.trim()) return ""
  const resolved = path.resolve(value.trim())
  if (!path.isAbsolute(resolved)) return ""
  return resolved
}

function mergeConfig(
  app: App,
  stored: (Partial<AppConfig> & { dataRoot?: string }) | null
): AppConfig {
  const workspaceDir = normalizeWorkspaceDir(stored?.workspaceDir)
  const { dataRoot: _legacyDataRoot, ...storedRest } = stored ?? {}
  void _legacyDataRoot
  const base = {
    ...DEFAULT_APP_CONFIG,
    ...storedRest,
    workspaceDir,
  }
  return {
    ...base,
    version: APP_CONFIG_VERSION,
    chatModels: (stored?.chatModels ?? base.chatModels ?? [])
      .filter((e) => (e as { transport?: string }).transport !== "ollama")
      .map((e) => ({
        id: e.id,
        label: e.label,
        tier: e.tier,
        model: e.model?.trim() ?? "",
        enabled: e.enabled !== false,
        preset: e.preset,
        baseUrl: e.baseUrl,
        apiKey: e.apiKey,
        contextWindow:
          typeof e.contextWindow === "number" &&
          Number.isFinite(e.contextWindow) &&
          e.contextWindow > 0
            ? Math.floor(e.contextWindow)
            : undefined,
      })),
    activeChatModelId: stored?.activeChatModelId?.trim() ?? "",
    agentThinkingLevel: normalizeAgentThinkingLevel(stored?.agentThinkingLevel),
  }
}

export function loadAppConfig(app: App): AppConfig {
  const configPath = getAppConfigPath(app)
  let stored: Partial<AppConfig> | null = null

  if (fsSync.existsSync(configPath)) {
    try {
      stored = JSON.parse(
        fsSync.readFileSync(configPath, "utf8")
      ) as Partial<AppConfig>
    } catch (error) {
      console.warn("[app-config] parse failed:", error)
    }
  }

  const merged = mergeConfig(app, stored)

  if (!fsSync.existsSync(configPath)) {
    void saveAppConfig(app, merged).catch((e) =>
      console.warn("[app-config] create default failed:", e)
    )
  }

  return merged
}

export async function saveAppConfig(
  app: App,
  config: AppConfig
): Promise<AppConfig> {
  const merged = mergeConfig(app, config)
  const configPath = getAppConfigPath(app)
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8")
  return merged
}
