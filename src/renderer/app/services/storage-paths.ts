import {
  getStoragePaths as getStoragePathsFromElectron,
  pickDirectory,
  resetStoragePaths as resetStoragePathsElectron,
  saveStoragePaths as saveStoragePathsElectron,
  saveWorkspaceDir as saveWorkspaceDirElectron,
} from "~/services/electron-client"

export type StoragePaths = {
  dataRoot: string
  workspaceDir: string
  workspaceCustomized: boolean
  modelsDir: string
  databaseFile: string
  memoriesDir: string
  personasDir: string
  skillsDir: string
  configFile: string
  defaultDataRoot: string
  defaultModelsDir: string
  isCustomized: boolean
}

export type StoragePathsSaveResult = StoragePaths & {
  migration?: {
    from: string
    to: string
    movedCount: number
  }
}

export type StoragePathsInput = {
  dataRoot: string
}

export async function getStoragePaths(): Promise<StoragePaths> {
  return getStoragePathsFromElectron()
}

export async function saveStoragePaths(
  input: StoragePathsInput
): Promise<StoragePathsSaveResult> {
  return saveStoragePathsElectron(input)
}

export async function resetStoragePaths(): Promise<StoragePathsSaveResult> {
  return resetStoragePathsElectron()
}

export async function saveWorkspaceDir(
  workspaceDir: string | null
): Promise<StoragePaths> {
  return saveWorkspaceDirElectron(workspaceDir)
}

export async function pickStorageDirectory(options?: {
  title?: string
  defaultPath?: string
}): Promise<string | null> {
  return pickDirectory(options)
}
