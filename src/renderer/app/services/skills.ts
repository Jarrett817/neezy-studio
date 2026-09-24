import type { SkillPublisherId } from "../../../shared/skill-registry"
import { getElectronApi } from "./electron-client"

export type InstalledSkill = {
  id: string
  publisher: SkillPublisherId
  installKey: string
  name: string
  description: string
  skillDir: string
  installedAt: number
}

export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  return getElectronApi().skillsListInstalled()
}

export async function uninstallSkill(installKey: string): Promise<void> {
  await getElectronApi().skillsUninstall(installKey)
}

export async function importSkillFromPath(sourcePath: string): Promise<InstalledSkill> {
  return getElectronApi().skillsImportFromPath(sourcePath)
}

export async function importSkillsFromDrop(files: File[]): Promise<InstalledSkill[]> {
  const api = getElectronApi()
  const paths = [...new Set(files.map((f) => api.getPathForFile(f)).filter(Boolean))]
  const installed: InstalledSkill[] = []
  for (const sourcePath of paths) {
    installed.push(await importSkillFromPath(sourcePath))
  }
  return installed
}
