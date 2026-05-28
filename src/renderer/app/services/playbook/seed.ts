import { exists, join, writeTextFile } from "~/services/electron-client"
import { listSkills } from "~/services/storage/skills"
import { getStoragePaths } from "~/services/storage-paths"

import { BUILTIN_SKILL_SEEDS } from "./builtin-manifest"

function skillMd(id: string, seed: (typeof BUILTIN_SKILL_SEEDS)[string]): string {
  return [
    `# ${seed.name}`,
    "",
    "## 描述",
    seed.description.trim(),
    "",
    "## 指令",
    seed.instructions.trim(),
    "",
    "## Prompt",
    seed.prompt.trim(),
    "",
  ].join("\n")
}

export async function seedBuiltinSkills(): Promise<void> {
  const { skillsDir } = await getStoragePaths()
  const existing = await listSkills()
  const ids = new Set(existing.map((s) => s.id))

  for (const [id, seed] of Object.entries(BUILTIN_SKILL_SEEDS)) {
    if (ids.has(id)) continue
    const path = await join(skillsDir, `${id}.md`)
    await writeTextFile(path, skillMd(id, seed))
  }
}

export async function ensurePlaybookDirs(): Promise<void> {
  const { playbooksDir, inputProfilesDir } = await getStoragePaths()
  const { mkdir } = await import("~/services/electron-client")
  for (const dir of [playbooksDir, inputProfilesDir]) {
    if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  }
  await seedBuiltinSkills()
}
