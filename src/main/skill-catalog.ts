import {
  githubSkillRawUrl,
  searchSkillCatalog,
  SKILL_PUBLISHERS,
  type SkillCatalogEntry,
  type SkillPublisherId,
} from "../shared/skill-registry"
import { resolveEntryApiBase, resolveEntryApiKey } from "./chat-model-entry"
import { resolveChatModelEntry } from "./model-routing"
import { getSyncedRuntimeSettings } from "./runtime-settings"
import { log } from "./logger"

const ANTHROPIC_SKILLS_BETA = "skills-2025-10-02"
const ANTHROPIC_VERSION = "2023-06-01"
const GITHUB_API = "https://api.github.com"

type ApiSkillRow = {
  id?: string
  display_title?: string
  description?: string
}

type GithubContentRow = {
  name: string
  path: string
  type: "file" | "dir" | "symlink" | "submodule"
}

let catalogCache: {
  at: number
  entries: SkillCatalogEntry[]
} | null = null

const CACHE_TTL_MS = 5 * 60 * 1000

function resolveSkillsApiCredentials(): { apiKey: string; listUrl: string } | null {
  const settings = getSyncedRuntimeSettings()
  const entry = resolveChatModelEntry(settings)
  const apiKey = (
    entry ? resolveEntryApiKey(entry, settings.llmProvider) : settings.llmProvider.apiKey
  ).trim()
  if (!apiKey) return null

  const base = entry
    ? resolveEntryApiBase(entry, settings.llmProvider)
    : settings.llmProvider.baseUrl.trim()
  const listUrl = resolveSkillsListUrl(base)
  return { apiKey, listUrl }
}

function resolveSkillsListUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "")
  if (!trimmed) return "https://api.anthropic.com/v1/skills?source=anthropic"
  if (trimmed.includes("api.anthropic.com")) {
    const root = trimmed.replace(/\/v1(?:\/messages|\/skills)?$/i, "")
    return `${root}/v1/skills?source=anthropic`
  }
  if (/\/anthropic$/i.test(trimmed)) return `${trimmed}/v1/skills?source=anthropic`
  if (/\/v1$/i.test(trimmed)) return `${trimmed.replace(/\/v1$/i, "")}/v1/skills?source=anthropic`
  return "https://api.anthropic.com/v1/skills?source=anthropic"
}

async function fetchAnthropicApiCatalog(): Promise<SkillCatalogEntry[]> {
  const creds = resolveSkillsApiCredentials()
  if (!creds) return []

  try {
    const res = await fetch(creds.listUrl, {
      headers: {
        Accept: "application/json",
        "x-api-key": creds.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_SKILLS_BETA,
        "User-Agent": "NeezyStudio/1.0",
      },
    })
    if (!res.ok) {
      log.warn(`[skill-catalog] Anthropic API ${res.status}: ${await res.text()}`)
      return []
    }
    const body = (await res.json()) as { data?: ApiSkillRow[] }
    const meta = SKILL_PUBLISHERS.anthropic
    const rows: SkillCatalogEntry[] = []
    for (const row of body.data ?? []) {
      const id = String(row.id ?? "").trim()
      if (!id) continue
      rows.push({
        id,
        publisher: "anthropic",
        title: row.display_title?.trim() || id,
        description: row.description?.trim() || row.display_title?.trim() || id,
        subpath: `${meta.skillsPath}/${id}`,
        source: "api",
      })
    }
    return rows
  } catch (error) {
    log.warn(
      "[skill-catalog] Anthropic API failed:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

async function fetchGithubFlatSkills(
  publisher: SkillPublisherId
): Promise<SkillCatalogEntry[]> {
  const meta = SKILL_PUBLISHERS[publisher]
  const url = `${GITHUB_API}/repos/${meta.repo}/contents/${meta.skillsPath}?ref=${encodeURIComponent(meta.ref)}`

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "NeezyStudio/1.0",
      },
    })
    if (!res.ok) {
      log.warn(`[skill-catalog] GitHub ${meta.repo} ${res.status}`)
      return []
    }
    const rows = (await res.json()) as GithubContentRow[]
    if (!Array.isArray(rows)) return []

    const entries: SkillCatalogEntry[] = []
    for (const row of rows) {
      if (row.type !== "dir") continue
      const id = row.name.trim()
      if (!id) continue
      const subpath = row.path.replace(/^\/+/, "")
      const description = await readSkillDescriptionFromGithub(meta.repo, meta.ref, subpath)
      entries.push({
        id,
        publisher,
        title: id,
        description: description || id,
        subpath,
        source: "github",
      })
    }
    return entries.sort((a, b) => a.id.localeCompare(b.id))
  } catch (error) {
    log.warn(
      `[skill-catalog] GitHub ${publisher} failed:`,
      error instanceof Error ? error.message : error
    )
    return []
  }
}

const CURSOR_PLUGIN_SKIP = new Set(["schemas", "scripts"])

async function fetchCursorPluginSkills(): Promise<SkillCatalogEntry[]> {
  const meta = SKILL_PUBLISHERS.cursor
  const rootUrl = `${GITHUB_API}/repos/${meta.repo}/contents?ref=${encodeURIComponent(meta.ref)}`

  try {
    const res = await fetch(rootUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "NeezyStudio/1.0",
      },
    })
    if (!res.ok) {
      log.warn(`[skill-catalog] GitHub ${meta.repo} ${res.status}`)
      return []
    }
    const plugins = (await res.json()) as GithubContentRow[]
    if (!Array.isArray(plugins)) return []

    const entries: SkillCatalogEntry[] = []
    for (const plugin of plugins) {
      if (plugin.type !== "dir") continue
      if (plugin.name.startsWith(".") || CURSOR_PLUGIN_SKIP.has(plugin.name)) continue

      const skillsUrl = `${GITHUB_API}/repos/${meta.repo}/contents/${plugin.path}/skills?ref=${encodeURIComponent(meta.ref)}`
      const skillsRes = await fetch(skillsUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "NeezyStudio/1.0",
        },
      })
      if (!skillsRes.ok) continue

      const skillDirs = (await skillsRes.json()) as GithubContentRow[]
      if (!Array.isArray(skillDirs)) continue

      for (const skill of skillDirs) {
        if (skill.type !== "dir") continue
        const skillName = skill.name.trim()
        if (!skillName) continue
        const subpath = `${plugin.name}/skills/${skillName}`
        const id = `${plugin.name}--${skillName}`
        const description = await readSkillDescriptionFromGithub(meta.repo, meta.ref, subpath)
        entries.push({
          id,
          publisher: "cursor",
          title: skillName,
          description: description || `${plugin.name} / ${skillName}`,
          subpath,
          source: "github",
        })
      }
    }
    return entries.sort((a, b) => a.id.localeCompare(b.id))
  } catch (error) {
    log.warn(
      "[skill-catalog] GitHub cursor/plugins failed:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

async function fetchPublisherGithubSkills(
  publisher: SkillPublisherId
): Promise<SkillCatalogEntry[]> {
  const layout = SKILL_PUBLISHERS[publisher].layout
  if (layout === "cursor-plugins") return fetchCursorPluginSkills()
  return fetchGithubFlatSkills(publisher)
}

async function readSkillDescriptionFromGithub(
  repo: string,
  ref: string,
  subpath: string
): Promise<string> {
  const url = githubSkillRawUrl(repo, ref, subpath, "SKILL.md")
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/plain", "User-Agent": "NeezyStudio/1.0" },
    })
    if (!res.ok) return ""
    const text = await res.text()
    const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*?)(?:\r?\n#|\r?\n##|$)/)
    const block = text.match(/^description:\s*(.+)$/m)?.[1]?.trim()
    if (block) return block.replace(/^["']|["']$/g, "").slice(0, 400)
    return match?.[1]?.trim().slice(0, 200) ?? ""
  } catch {
    return ""
  }
}

async function listGithubSkillFiles(
  repo: string,
  ref: string,
  subpath: string
): Promise<string[]> {
  const url = `${GITHUB_API}/repos/${repo}/contents/${subpath.replace(/^\/+/, "")}?ref=${encodeURIComponent(ref)}`
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "NeezyStudio/1.0",
      },
    })
    if (!res.ok) return ["SKILL.md"]
    const rows = (await res.json()) as GithubContentRow[]
    if (!Array.isArray(rows)) return ["SKILL.md"]
    const files = rows.filter((r) => r.type === "file").map((r) => r.name)
    return files.includes("SKILL.md") ? files : ["SKILL.md", ...files]
  } catch {
    return ["SKILL.md"]
  }
}

export async function fetchSkillCatalog(
  publishers: SkillPublisherId[] = ["anthropic", "cursor"]
): Promise<SkillCatalogEntry[]> {
  const now = Date.now()
  if (catalogCache && now - catalogCache.at < CACHE_TTL_MS) {
    return catalogCache.entries.filter((e) => publishers.includes(e.publisher))
  }

  const merged = new Map<string, SkillCatalogEntry>()

  if (publishers.includes("anthropic")) {
    const apiRows = await fetchAnthropicApiCatalog()
    if (apiRows.length > 0) {
      for (const row of apiRows) merged.set(`anthropic:${row.id}`, row)
    } else {
      const gh = await fetchPublisherGithubSkills("anthropic")
      for (const row of gh) merged.set(`anthropic:${row.id}`, row)
    }
  }

  if (publishers.includes("cursor")) {
    const gh = await fetchPublisherGithubSkills("cursor")
    for (const row of gh) merged.set(`cursor:${row.id}`, row)
  }

  const entries = [...merged.values()].sort((a, b) =>
    a.publisher === b.publisher ? a.id.localeCompare(b.id) : a.publisher.localeCompare(b.publisher)
  )
  catalogCache = { at: now, entries }
  return entries.filter((e) => publishers.includes(e.publisher))
}

export async function findCatalogEntry(
  publisher: SkillPublisherId,
  skillId: string
): Promise<SkillCatalogEntry | undefined> {
  const catalog = await fetchSkillCatalog([publisher])
  return catalog.find((e) => e.publisher === publisher && e.id === skillId)
}

export async function searchCatalogWithInstallState(
  query: string,
  installedKeys: Set<string>,
  publishers?: SkillPublisherId[]
): Promise<Array<SkillCatalogEntry & { installed: boolean; installKey: string }>> {
  const catalog = await fetchSkillCatalog(publishers)
  const hits = searchSkillCatalog(catalog, query)
  return hits.map((entry) => {
    const installKey = `${entry.publisher}:${entry.id}`
    return {
      ...entry,
      installKey,
      installed: installedKeys.has(installKey) || installedKeys.has(entry.id),
    }
  })
}

export async function listGithubInstallFiles(
  entry: SkillCatalogEntry
): Promise<string[]> {
  const meta = SKILL_PUBLISHERS[entry.publisher]
  const files = await listGithubSkillFiles(meta.repo, meta.ref, entry.subpath)
  return files.filter((f) => f.endsWith(".md") || f.endsWith(".txt") || f.endsWith(".json"))
}

export function githubRawForEntry(entry: SkillCatalogEntry, file: string): string {
  const meta = SKILL_PUBLISHERS[entry.publisher]
  return githubSkillRawUrl(meta.repo, meta.ref, entry.subpath, file)
}

export function invalidateSkillCatalogCache(): void {
  catalogCache = null
}
