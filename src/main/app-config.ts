import type { App } from "electron"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"

import {
  APP_CONFIG_VERSION,
  DEFAULT_APP_CONFIG,
  type AppConfig,
} from "../shared/app-config"

export const CONFIG_FILE = "app-config.json"

export function getAppConfigPath(app: App): string {
  return path.join(app.getPath("userData"), CONFIG_FILE)
}

function normalizeDataRoot(app: App, value: string | undefined): string {
  const fallback = app.getPath("userData")
  if (!value?.trim()) return fallback
  const resolved = path.resolve(value.trim())
  if (!path.isAbsolute(resolved)) return fallback
  return resolved
}

function mergeConfig(app: App, stored: Partial<AppConfig> | null): AppConfig {
  const dataRoot = normalizeDataRoot(app, stored?.dataRoot)
  const base = { ...DEFAULT_APP_CONFIG, ...(stored ?? {}), dataRoot }
  return {
    ...base,
    version: APP_CONFIG_VERSION,
    ollamaHost: base.ollamaHost?.trim() || DEFAULT_APP_CONFIG.ollamaHost,
    chatModels: (stored?.chatModels ?? base.chatModels ?? []).map((e) => ({
      ...e,
      enabled: e.enabled !== false,
      model: e.model?.trim() ?? "",
    })),
    activeChatModelId: stored?.activeChatModelId?.trim() ?? "",
  }
}

export function loadAppConfig(app: App): AppConfig {
  const configPath = getAppConfigPath(app)
  let stored: Partial<AppConfig> | null = null

  if (fsSync.existsSync(configPath)) {
    try {
      stored = JSON.parse(fsSync.readFileSync(configPath, "utf8")) as Partial<AppConfig>
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

export async function saveAppConfig(app: App, config: AppConfig): Promise<AppConfig> {
  const merged = mergeConfig(app, config)
  const configPath = getAppConfigPath(app)
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8")
  return merged
}
