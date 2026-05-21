import {
  getStoragePaths as getStoragePathsFromElectron,
  pickDirectory,
  resetStoragePaths as resetStoragePathsElectron,
  saveStoragePaths as saveStoragePathsElectron,
} from "~/services/electron-client"

export type StoragePaths = {
  dataRoot: string
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

export type StoragePathsInput = {
  dataRoot: string
}

export async function getStoragePaths(): Promise<StoragePaths> {
  return getStoragePathsFromElectron()
}

export async function saveStoragePaths(
  input: StoragePathsInput
): Promise<StoragePaths> {
  return saveStoragePathsElectron(input)
}

export async function resetStoragePaths(): Promise<StoragePaths> {
  return resetStoragePathsElectron()
}

export async function pickStorageDirectory(options?: {
  title?: string
  defaultPath?: string
}): Promise<string | null> {
  return pickDirectory(options)
}
