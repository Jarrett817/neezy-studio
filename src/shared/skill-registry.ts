/** Skill 发布源与目录条目（Anthropic API / GitHub 动态索引） */

export const SKILL_CATALOG_PUBLISHER_IDS = ["anthropic", "cursor"] as const
export type SkillCatalogPublisherId = (typeof SKILL_CATALOG_PUBLISHER_IDS)[number]

export const SKILL_PUBLISHER_IDS = [...SKILL_CATALOG_PUBLISHER_IDS, "local"] as const
export type SkillPublisherId = (typeof SKILL_PUBLISHER_IDS)[number]

export type SkillPublisherLayout = "flat-skills" | "cursor-plugins"

export interface SkillPublisherMeta {
  id: SkillPublisherId
  label: string
  description: string
  repo: string
  /** flat-skills：仓库内 skills 根目录；cursor-plugins 忽略 */
  skillsPath: string
  ref: string
  layout: SkillPublisherLayout
}

export const SKILL_PUBLISHERS: Record<SkillPublisherId, SkillPublisherMeta> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic 官方",
    description: "Anthropic API 目录；安装包来自 anthropics/skills",
    repo: "anthropics/skills",
    skillsPath: "skills",
    ref: "main",
    layout: "flat-skills",
  },
  cursor: {
    id: "cursor",
    label: "Cursor 官方",
    description: "Cursor Marketplace 官方插件 skill（github.com/cursor/plugins）",
    repo: "cursor/plugins",
    skillsPath: "",
    ref: "main",
    layout: "cursor-plugins",
  },
  local: {
    id: "local",
    label: "本地导入",
    description: "拖入或选择含 SKILL.md 的文件夹",
    repo: "",
    skillsPath: "",
    ref: "main",
    layout: "flat-skills",
  },
}

export interface SkillCatalogEntry {
  id: string
  publisher: SkillPublisherId
  description: string
  /** GitHub 安装子路径，如 skills/xlsx 或 cursor-team-kit/skills/fix-ci */
  subpath: string
  extraFiles?: string[]
  /** API 返回的 display_title */
  title?: string
  /** catalog 来源：api | github */
  source: "api" | "github"
}

export function skillInstallKey(publisher: SkillPublisherId, id: string): string {
  return `${publisher}:${id}`
}

export function parseSkillInstallKey(key: string): {
  publisher: SkillPublisherId
  id: string
} | null {
  const idx = key.indexOf(":")
  if (idx <= 0) return null
  const publisher = key.slice(0, idx) as SkillPublisherId
  const id = key.slice(idx + 1)
  if (!SKILL_PUBLISHER_IDS.includes(publisher) || !id) return null
  return { publisher, id }
}

export function searchSkillCatalog(
  entries: SkillCatalogEntry[],
  query: string
): SkillCatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(
    (e) =>
      e.id.includes(q) ||
      e.title?.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.publisher.includes(q) ||
      e.subpath.toLowerCase().includes(q)
  )
}

export function githubSkillRawUrl(
  repo: string,
  ref: string,
  subpath: string,
  file: string
): string {
  const clean = (s: string) => s.replace(/^\/+|\/+$/g, "")
  return `https://raw.githubusercontent.com/${repo}/${ref}/${clean(subpath)}/${clean(file)}`
}
