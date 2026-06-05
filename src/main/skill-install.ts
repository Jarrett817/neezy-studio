import fs from "node:fs"
import fsPromises from "node:fs/promises"
import path from "node:path"

import {
  parseSkillInstallKey,
  skillInstallKey,
  type SkillPublisherId,
} from "../shared/skill-registry"

import {
  fetchSkillCatalog,
  findCatalogEntry,
  githubRawForEntry,
  invalidateSkillCatalogCache,
  listGithubInstallFiles,
} from "./skill-catalog"
import { log } from "./logger"
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

export function getPublisherSkillsRoot(
  dataRoot: string,
  publisher: SkillPublisherId
): string {
  return path.join(getSkillsRoot(dataRoot), publisher)
}

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return { name: "", description: content.slice(0, 200).trim() }
  }
  const block = match[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? ""
  const descRaw = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ""
  const description = descRaw.replace(/^["']|["']$/g, "").replace(/^>\s*/gm, "").trim()
  return { name, description }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "text/plain", "User-Agent": "NeezyStudio/1.0" },
  })
  if (!res.ok) throw new Error(`下载失败 (${res.status}): ${url}`)
  return res.text()
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

function isKnownPublisher(name: string): name is SkillPublisherId {
  return name === "anthropic" || name === "cursor" || name === "local"
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
  const destDir = path.join(getPublisherSkillsRoot(dataRoot, "local"), id)

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

export async function listInstalledSkills(dataRoot: string): Promise<InstalledSkill[]> {
  const root = getSkillsRoot(dataRoot)
  let publishers: string[] = []
  try {
    publishers = await fsPromises.readdir(root)
  } catch {
    return []
  }

  const installed: InstalledSkill[] = []
  for (const publisher of publishers) {
    if (!isKnownPublisher(publisher)) continue
    const pubRoot = path.join(root, publisher)
    let ids: string[] = []
    try {
      ids = await fsPromises.readdir(pubRoot)
    } catch {
      continue
    }
    for (const id of ids) {
      const skillDir = path.join(pubRoot, id)
      const skillMd = path.join(skillDir, "SKILL.md")
      try {
        const stat = await fsPromises.stat(skillDir)
        if (!stat.isDirectory()) continue
        const content = await fsPromises.readFile(skillMd, "utf-8")
        const meta = parseSkillFrontmatter(content)
        const catalog = await findCatalogEntry(publisher as SkillPublisherId, id)
        installed.push({
          id,
          publisher: publisher as SkillPublisherId,
          installKey: skillInstallKey(publisher as SkillPublisherId, id),
          name: meta.name || id,
          description: meta.description || catalog?.description || "",
          skillDir,
          installedAt: stat.mtimeMs,
        })
      } catch {
        // skip incomplete
      }
    }
  }
  return installed.sort((a, b) =>
    a.publisher === b.publisher ? a.id.localeCompare(b.id) : a.publisher.localeCompare(b.publisher)
  )
}

export function listAllInstalledSkillDirs(dataRoot: string): string[] {
  const root = getSkillsRoot(dataRoot)
  try {
    const dirs: string[] = []
    for (const publisher of fs.readdirSync(root, { withFileTypes: true })) {
      if (!publisher.isDirectory()) continue
      if (!isKnownPublisher(publisher.name)) continue
      const pubRoot = path.join(root, publisher.name)
      for (const entry of fs.readdirSync(pubRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const skillDir = path.join(pubRoot, entry.name)
        if (fs.existsSync(path.join(skillDir, "SKILL.md"))) dirs.push(skillDir)
      }
    }
    return dirs
  } catch {
    return []
  }
}

export async function installSkill(
  dataRoot: string,
  publisher: SkillPublisherId,
  skillId: string
): Promise<InstalledSkill> {
  const entry = await findCatalogEntry(publisher, skillId)
  if (!entry) {
    throw new Error(`未在 ${publisher} 目录中找到 skill: ${skillId}`)
  }

  const skillDir = path.join(getPublisherSkillsRoot(dataRoot, publisher), entry.id)
  await fsPromises.mkdir(skillDir, { recursive: true })

  const files = await listGithubInstallFiles(entry)
  for (const file of files) {
    const url = githubRawForEntry(entry, file)
    const text = await fetchText(url)
    const dest = path.join(skillDir, file)
    await fsPromises.mkdir(path.dirname(dest), { recursive: true })
    await fsPromises.writeFile(dest, text, "utf-8")
    log.info(`[skill-install] ${publisher}/${entry.id}/${file}`)
  }

  invalidateSkillCatalogCache()
  invalidatePiResourceLoaderCache()

  const content = await fsPromises.readFile(path.join(skillDir, "SKILL.md"), "utf-8")
  const meta = parseSkillFrontmatter(content)
  const stat = await fsPromises.stat(skillDir)

  return {
    id: entry.id,
    publisher,
    installKey: skillInstallKey(publisher, entry.id),
    name: meta.name || entry.title || entry.id,
    description: meta.description || entry.description,
    skillDir,
    installedAt: stat.mtimeMs,
  }
}

export async function installSkillByKey(
  dataRoot: string,
  key: string
): Promise<InstalledSkill> {
  const parsed = parseSkillInstallKey(key.trim())
  if (!parsed) {
    return installSkill(dataRoot, "anthropic", key.trim())
  }
  return installSkill(dataRoot, parsed.publisher, parsed.id)
}

export async function uninstallSkill(
  dataRoot: string,
  publisher: SkillPublisherId,
  skillId: string
): Promise<void> {
  const skillDir = path.join(getPublisherSkillsRoot(dataRoot, publisher), skillId)
  await fsPromises.rm(skillDir, { recursive: true, force: true })
  invalidatePiResourceLoaderCache()
}

export async function uninstallSkillByKey(dataRoot: string, key: string): Promise<void> {
  const parsed = parseSkillInstallKey(key.trim())
  if (!parsed) {
    await uninstallSkill(dataRoot, "anthropic", key.trim())
    return
  }
  await uninstallSkill(dataRoot, parsed.publisher, parsed.id)
}

export async function warmSkillCatalog(): Promise<void> {
  await fetchSkillCatalog()
}
