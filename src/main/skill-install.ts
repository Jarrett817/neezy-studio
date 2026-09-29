import fs from "node:fs"
import fsPromises from "node:fs/promises"
import path from "node:path"

import {
  type SkillPublisherId,
  skillInstallKey,
} from "../shared/skill-registry"
import { invalidatePiResourceLoaderCache } from "./pi-agent"

export interface InstalledSkill {
  id: string
  publisher: SkillPublisherId
  installKey: string
  name: string
  description: string
  skillDir: string
  installedAt: number
}

export function getSkillsRoot(dataRoot: string): string {
  return path.join(dataRoot, "skills")
}

function getPublisherSkillsRoot(dataRoot: string): string {
  return path.join(getSkillsRoot(dataRoot), "local")
}

function parseSkillFrontmatter(content: string): {
  name: string
  description: string
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return { name: "", description: content.slice(0, 200).trim() }
  }
  const block = match[1]
  const name =
    block
      .match(/^name:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? ""
  const descRaw = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ""
  const description = descRaw
    .replace(/^["']|["']$/g, "")
    .replace(/^>\s*/gm, "")
    .trim()
  return { name, description }
}

function sanitizeSkillId(name: string): string {
  const id = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
  return id || "skill"
}

async function resolveSkillRoot(sourcePath: string): Promise<string> {
  const trimmed = sourcePath.trim()
  const stat = await fsPromises.stat(trimmed)
  if (stat.isFile()) {
    if (path.basename(trimmed).toLowerCase() !== "skill.md") {
      throw new Error("请拖入 skill 文件夹或 SKILL.md")
    }
    return path.dirname(trimmed)
  }
  return trimmed
}

export async function importSkillFromPath(
  dataRoot: string,
  sourcePath: string
): Promise<InstalledSkill> {
  const skillRoot = await resolveSkillRoot(sourcePath)
  const skillMd = path.join(skillRoot, "SKILL.md")
  if (!fs.existsSync(skillMd)) {
    throw new Error("未找到 SKILL.md")
  }

  const content = await fsPromises.readFile(skillMd, "utf-8")
  const meta = parseSkillFrontmatter(content)
  const id = sanitizeSkillId(meta.name || path.basename(skillRoot))
  const destDir = path.join(getPublisherSkillsRoot(dataRoot), id)

  await fsPromises.rm(destDir, { recursive: true, force: true })
  await fsPromises.cp(skillRoot, destDir, { recursive: true })

  invalidatePiResourceLoaderCache()

  const stat = await fsPromises.stat(destDir)
  return {
    id,
    publisher: "local",
    installKey: skillInstallKey("local", id),
    name: meta.name || id,
    description: meta.description || meta.name || id,
    skillDir: destDir,
    installedAt: stat.mtimeMs,
  }
}

export async function listInstalledSkills(
  dataRoot: string
): Promise<InstalledSkill[]> {
  const root = getPublisherSkillsRoot(dataRoot)
  let ids: string[] = []
  try {
    ids = await fsPromises.readdir(root)
  } catch {
    return []
  }

  const installed: InstalledSkill[] = []
  for (const id of ids) {
    const skillDir = path.join(root, id)
    const skillMd = path.join(skillDir, "SKILL.md")
    try {
      const stat = await fsPromises.stat(skillDir)
      if (!stat.isDirectory()) continue
      const content = await fsPromises.readFile(skillMd, "utf-8")
      const meta = parseSkillFrontmatter(content)
      installed.push({
        id,
        publisher: "local",
        installKey: skillInstallKey("local", id),
        name: meta.name || id,
        description: meta.description || "",
        skillDir,
        installedAt: stat.mtimeMs,
      })
    } catch {
      // skip incomplete
    }
  }
  return installed.sort((a, b) => a.id.localeCompare(b.id))
}

export function listAllInstalledSkillDirs(dataRoot: string): string[] {
  const root = getPublisherSkillsRoot(dataRoot)
  try {
    const dirs: string[] = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillDir = path.join(root, entry.name)
      if (fs.existsSync(path.join(skillDir, "SKILL.md"))) dirs.push(skillDir)
    }
    return dirs
  } catch {
    return []
  }
}

export async function uninstallSkillByKey(
  dataRoot: string,
  key: string
): Promise<void> {
  const id = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key
  const skillDir = path.join(getPublisherSkillsRoot(dataRoot), id)
  await fsPromises.rm(skillDir, { recursive: true, force: true })
  invalidatePiResourceLoaderCache()
}
