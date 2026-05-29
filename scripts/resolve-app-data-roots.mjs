#!/usr/bin/env node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const appName = "neezy-studio"

export function getDefaultUserDataDir() {
  const roaming =
    process.env.APPDATA ??
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), "AppData", "Roaming"))
  return path.join(roaming, appName)
}

function readDataRootFromAppConfig(userData) {
  const configFile = path.join(userData, "app-config.json")
  if (!fs.existsSync(configFile)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(configFile, "utf8"))
    if (raw?.dataRoot?.trim()) return path.resolve(raw.dataRoot.trim())
  } catch {
    /* ignore */
  }
  return null
}

/** 与 Electron userData + app-config.dataRoot 对齐的 memories.db 候选目录 */
export function resolveDataRoots() {
  const userData = getDefaultUserDataDir()
  const roots = new Set([userData])
  const fromAppConfig = readDataRootFromAppConfig(userData)
  if (fromAppConfig) roots.add(fromAppConfig)
  return [...roots]
}
