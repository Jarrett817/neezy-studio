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

export async function importSkillFromPath(
  sourcePath: string
): Promise<InstalledSkill> {
  return getElectronApi().skillsImportFromPath(sourcePath)
}

export async function importSkillsFromDrop(
  files: File[]
): Promise<InstalledSkill[]> {
  const api = getElectronApi()
  const paths = [
    ...new Set(files.map((f) => api.getPathForFile(f)).filter(Boolean)),
  ]
  const installed: InstalledSkill[] = []
  for (const sourcePath of paths) {
    installed.push(await importSkillFromPath(sourcePath))
  }
  return installed
}

export type AgentSkill = {
  id: string
  name: string
  description: string
  slug: string
  sourceKind: string
  rootPath?: string
  skillMdPath?: string
  instructions: string
  prompt: string
  enabled: boolean
  fileCount: number
  hasScripts: boolean
  hasReferences: boolean
  hasAssets: boolean
  updatedAt?: string
}

/** 供 UI 层使用的 skill 视图模型（基于已安装列表映射）。 */
export async function listSkills(): Promise<AgentSkill[]> {
  const rows = await listInstalledSkills()
  return rows.map((skill) => ({
    id: skill.installKey,
    name: skill.name,
    description: skill.description.trim(),
    slug: skill.id,
    sourceKind: skill.publisher,
    instructions: "",
    prompt: "",
    enabled: true,
    fileCount: 1,
    hasScripts: false,
    hasReferences: false,
    hasAssets: false,
    updatedAt: String(skill.installedAt),
  }))
}
