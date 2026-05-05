// 运行时设置 - 前端 via tauri-plugin-fs

import { appDataDir, join } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  ollamaModel: string
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  ollamaModel: "qwen3:1.7b",
}

async function getSettingsPath(): Promise<string> {
  const baseDir = await appDataDir()
  return await join(baseDir, "runtime-settings.json")
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  try {
    const path = await getSettingsPath()
    const fileExists = await exists(path)
    if (!fileExists) {
      return DEFAULT_SETTINGS
    }
    const content = await readTextFile(path)
    return JSON.parse(content) as RuntimeSettings
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettings> {
  const path = await getSettingsPath()
  const baseDir = await appDataDir()

  // 确保目录存在
  const dirExists = await exists(baseDir)
  if (!dirExists) {
    await mkdir(baseDir, { recursive: true })
  }

  await writeTextFile(path, JSON.stringify(settings, null, 2))
  return settings
}
