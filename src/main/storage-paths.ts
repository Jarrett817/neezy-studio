import fsSync from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import type { App } from "electron"

import { loadAppConfig, saveAppConfig } from "./app-config"
import type { StoragePaths } from "./types"

let cachedPaths: StoragePaths | null = null

function userDataRoot(app: App): string {
  return app.getPath("userData")
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

function assertExistingDirectory(dir: string, label: string): string {
  const resolved = normalizeAbsolutePath(dir, label)
  let stat: fsSync.Stats
  try {
    stat = fsSync.statSync(resolved)
  } catch {
    throw new Error(`${label}不存在`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label}必须是文件夹`)
  }
  return resolved
}

function buildResolved(app: App, workspaceDirRaw: string): StoragePaths {
  const dataRoot = userDataRoot(app)
  const workspaceCustomized = Boolean(workspaceDirRaw.trim())
  const workspaceDir = workspaceCustomized
    ? normalizeAbsolutePath(workspaceDirRaw, "工作区")
    : dataRoot

  return {
    dataRoot,
    workspaceDir,
    workspaceCustomized,
    configFile: path.join(dataRoot, "app-config.json"),
  }
}

export function resolveStoragePaths(
  app: App,
  { fresh = false }: { fresh?: boolean } = {}
): StoragePaths {
  if (!fresh && cachedPaths) return cachedPaths
  const config = loadAppConfig(app)
  cachedPaths = buildResolved(app, config.workspaceDir ?? "")
  return cachedPaths
}

export function resolveWorkspaceDir(app: App): string {
  return resolveStoragePaths(app).workspaceDir
}

export function invalidateStoragePathsCache(): void {
  cachedPaths = null
}

export async function ensureStorageDirs(paths: StoragePaths): Promise<void> {
  await fs.mkdir(paths.dataRoot, { recursive: true })
  await fs.mkdir(path.join(paths.dataRoot, "pi-sessions"), { recursive: true })
}

export async function saveWorkspaceDir(
  app: App,
  workspaceDir: string | null
): Promise<StoragePaths> {
  const config = loadAppConfig(app)
  const next = workspaceDir?.trim()
    ? assertExistingDirectory(workspaceDir, "工作区")
    : ""
  await saveAppConfig(app, { ...config, workspaceDir: next })
  invalidateStoragePathsCache()
  return resolveStoragePaths(app, { fresh: true })
}
