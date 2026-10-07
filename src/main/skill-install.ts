import fs from "node:fs"
import fsPromises from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { App } from "electron"

import {
  type SkillPublisherId,
  skillInstallKey,
} from "../shared/skill-registry"
import { invalidatePiResourceLoaderCache } from "./pi-agent"
import { getPiAgentDir } from "./pi-agent-env"

export interface InstalledSkill {
  id: string
  publisher: SkillPublisherId
  installKey: string
  name: string
  description: string
  skillDir: string
  installedAt: number
}

export function getAgentsSkillsRoot(): string {
  return path.join(homedir(), ".agents", "skills")
}

export function getPiAgentSkillsRoot(app: App): string {
  return path.join(getPiAgentDir(app), "skills")
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

async function readSkillFromDir(
  publisher: SkillPublisherId,
  root: string,
  dirName: string
): Promise<InstalledSkill | null> {
  const skillDir = path.join(root, dirName)
  const skillMd = path.join(skillDir, "SKILL.md")
  try {
    const stat = await fsPromises.stat(skillDir)
    if (!stat.isDirectory()) return null
    const content = await fsPromises.readFile(skillMd, "utf-8")
    const meta = parseSkillFrontmatter(content)
    return {
      id: dirName,
      publisher,
      installKey: skillInstallKey(publisher, dirName),
      name: meta.name || dirName,
      description: meta.description || "",
      skillDir,
      installedAt: stat.mtimeMs,
    }
  } catch {
    return null
  }
}

async function listSkillsInRoot(
  publisher: SkillPublisherId,
  root: string
): Promise<InstalledSkill[]> {
  let ids: string[] = []
  try {
    ids = await fsPromises.readdir(root)
  } catch {
    return []
  }
  const installed: InstalledSkill[] = []
  for (const dirName of ids) {
    const row = await readSkillFromDir(publisher, root, dirName)
    if (row) installed.push(row)
  }
  return installed
}

export async function listInstalledSkills(app: App): Promise<InstalledSkill[]> {
  const batches = await Promise.all([
    listSkillsInRoot("agents", getAgentsSkillsRoot()),
    listSkillsInRoot("pi-agent", getPiAgentSkillsRoot(app)),
  ])
  const byKey = new Map<string, InstalledSkill>()
  for (const row of batches.flat()) {
    byKey.set(row.installKey, row)
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN")
  )
}

function resolveSkillDirForKey(app: App, key: string): string {
  const sep = key.indexOf(":")
  const publisher = (
    sep >= 0 ? key.slice(0, sep) : "agents"
  ) as SkillPublisherId
  const id = sep >= 0 ? key.slice(sep + 1) : key
  const rootByPublisher: Record<SkillPublisherId, string> = {
    agents: getAgentsSkillsRoot(),
    "pi-agent": getPiAgentSkillsRoot(app),
  }
  const root = rootByPublisher[publisher]
  if (!root) throw new Error("无效的技能标识")
  return path.join(root, id)
}

export async function importSkillFromPath(
  app: App,
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
  const destDir = path.join(getAgentsSkillsRoot(), id)

  await fsPromises.mkdir(path.dirname(destDir), { recursive: true })
  await fsPromises.rm(destDir, { recursive: true, force: true })
  await fsPromises.cp(skillRoot, destDir, { recursive: true })

  invalidatePiResourceLoaderCache()

  const stat = await fsPromises.stat(destDir)
  return {
    id,
    publisher: "agents",
    installKey: skillInstallKey("agents", id),
    name: meta.name || id,
    description: meta.description || meta.name || id,
    skillDir: destDir,
    installedAt: stat.mtimeMs,
  }
}

export async function uninstallSkillByKey(
  app: App,
  key: string
): Promise<void> {
  const skillDir = resolveSkillDirForKey(app, key.trim())
  await fsPromises.rm(skillDir, { recursive: true, force: true })
  invalidatePiResourceLoaderCache()
}
