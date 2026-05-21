import type { App } from "electron"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"

import type { StoragePaths } from "./types"

export const CONFIG_NAME = "storage-paths.json"

let cachedPaths: StoragePaths | null = null

export function getConfigFilePath(app: App): string {
  return path.join(app.getPath("userData"), CONFIG_NAME)
}

function getSystemDefaultPaths(app: App) {
  const dataRoot = app.getPath("userData")
  return {
    dataRoot,
    modelsDir: path.join(dataRoot, "models"),
  }
}

function readOverrides(app: App): { dataRoot?: string } | null {
  const configFile = getConfigFilePath(app)
  if (!fsSync.existsSync(configFile)) return null
  try {
    const raw = JSON.parse(fsSync.readFileSync(configFile, "utf8")) as {
      dataRoot?: string
    }
    if (!raw || typeof raw !== "object") return null
    return raw
  } catch {
    return null
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

function buildResolved(
  app: App,
  overrides: { dataRoot?: string } | null
): StoragePaths {
  const systemDefaults = getSystemDefaultPaths(app)
  const dataRoot = overrides?.dataRoot
    ? normalizeAbsolutePath(overrides.dataRoot, "存储目录")
    : systemDefaults.dataRoot
  const modelsDir = path.join(dataRoot, "models")

  return {
    dataRoot,
    modelsDir,
    databaseFile: path.join(dataRoot, "memories.db"),
    memoriesDir: path.join(dataRoot, "memories"),
    personasDir: path.join(dataRoot, "personas"),
    skillsDir: path.join(dataRoot, "skills"),
    configFile: getConfigFilePath(app),
    defaultDataRoot: systemDefaults.dataRoot,
    defaultModelsDir: systemDefaults.modelsDir,
    isCustomized: Boolean(overrides?.dataRoot),
  }
}

export function resolveStoragePaths(
  app: App,
  { fresh = false }: { fresh?: boolean } = {}
): StoragePaths {
  if (!fresh && cachedPaths) return cachedPaths
  const overrides = readOverrides(app)
  cachedPaths = buildResolved(app, overrides)
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
}

export async function saveStoragePaths(
  app: App,
  input: { dataRoot: string }
): Promise<StoragePaths> {
  const dataRoot = normalizeAbsolutePath(input.dataRoot, "存储目录")
  const modelsDir = path.join(dataRoot, "models")

  const nextOverrides = { dataRoot }
  const resolved = buildResolved(app, nextOverrides)
  await ensureStorageDirs(resolved)
  await fs.writeFile(
    getConfigFilePath(app),
    JSON.stringify(nextOverrides, null, 2),
    "utf8"
  )
  invalidateStoragePathsCache()
  return resolveStoragePaths(app, { fresh: true })
}

export async function resetStoragePaths(app: App): Promise<StoragePaths> {
  const configFile = getConfigFilePath(app)
  if (fsSync.existsSync(configFile)) {
    await fs.rm(configFile, { force: true })
  }
  invalidateStoragePathsCache()
  const resolved = resolveStoragePaths(app, { fresh: true })
  await ensureStorageDirs(resolved)
  return resolved
}
