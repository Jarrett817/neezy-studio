import type { App } from "electron"
import fs from "node:fs/promises"
import path from "node:path"

import { loadAppConfig, saveAppConfig } from "./app-config"
import { migrateDataRoot } from "./data-root-migrate"
import type { StoragePaths, StoragePathsSaveResult } from "./types"

let cachedPaths: StoragePaths | null = null

function getSystemDefaultPaths(app: App) {
  const dataRoot = app.getPath("userData")
  return {
    dataRoot,
    modelsDir: path.join(dataRoot, "models"),
  }
}

function normalizeAbsolutePath(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`)
  }
  const resolved = path.resolve(value.trim())
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${label}必须是绝对路径`)
  }
  return resolved
}

function buildResolved(app: App, dataRoot: string): StoragePaths {
  const systemDefaults = getSystemDefaultPaths(app)
  const modelsDir = path.join(dataRoot, "models")

  return {
    dataRoot,
    modelsDir,
    databaseFile: path.join(dataRoot, "memories.db"),
    memoriesDir: path.join(dataRoot, "memories"),
    personasDir: path.join(dataRoot, "personas"),
    skillsDir: path.join(dataRoot, "skills"),
    playbooksDir: path.join(dataRoot, "playbooks"),
    inputProfilesDir: path.join(dataRoot, "input-profiles"),
    configFile: path.join(app.getPath("userData"), "app-config.json"),
    defaultDataRoot: systemDefaults.dataRoot,
    defaultModelsDir: systemDefaults.modelsDir,
    isCustomized: dataRoot !== systemDefaults.dataRoot,
  }
}

export function resolveStoragePaths(
  app: App,
  { fresh = false }: { fresh?: boolean } = {}
): StoragePaths {
  if (!fresh && cachedPaths) return cachedPaths
  const config = loadAppConfig(app)
  const systemDefaults = getSystemDefaultPaths(app)
  const dataRoot = config.dataRoot?.trim()
    ? normalizeAbsolutePath(config.dataRoot, "存储目录")
    : systemDefaults.dataRoot
  cachedPaths = buildResolved(app, dataRoot)
  return cachedPaths
}

export function invalidateStoragePathsCache(): void {
  cachedPaths = null
}

export async function ensureStorageDirs(paths: StoragePaths): Promise<void> {
  await fs.mkdir(paths.dataRoot, { recursive: true })
  await fs.mkdir(paths.modelsDir, { recursive: true })
  await fs.mkdir(paths.memoriesDir, { recursive: true })
  await fs.mkdir(paths.personasDir, { recursive: true })
  await fs.mkdir(paths.skillsDir, { recursive: true })
  await fs.mkdir(paths.playbooksDir, { recursive: true })
  await fs.mkdir(paths.inputProfilesDir, { recursive: true })
}

async function applyDataRootChange(
  app: App,
  nextDataRoot: string
): Promise<StoragePathsSaveResult> {
  const before = resolveStoragePaths(app, { fresh: true })
  const fromResolved = path.resolve(before.dataRoot)
  const toResolved = path.resolve(nextDataRoot)

  let migration: StoragePathsSaveResult["migration"]
  if (fromResolved !== toResolved) {
    const result = await migrateDataRoot(fromResolved, toResolved)
    if (result.moved.length > 0) {
      migration = {
        from: result.from,
        to: result.to,
        movedCount: result.moved.length,
      }
    }
  }

  const config = loadAppConfig(app)
  await saveAppConfig(app, { ...config, dataRoot: nextDataRoot })
  invalidateStoragePathsCache()
  const resolved = resolveStoragePaths(app, { fresh: true })
  await ensureStorageDirs(resolved)
  return migration ? { ...resolved, migration } : resolved
}

export async function saveStoragePaths(
  app: App,
  input: { dataRoot: string }
): Promise<StoragePathsSaveResult> {
  const dataRoot = normalizeAbsolutePath(input.dataRoot, "存储目录")
  return applyDataRootChange(app, dataRoot)
}

export async function resetStoragePaths(app: App): Promise<StoragePathsSaveResult> {
  const systemDefaults = getSystemDefaultPaths(app)
  return applyDataRootChange(app, systemDefaults.dataRoot)
}
