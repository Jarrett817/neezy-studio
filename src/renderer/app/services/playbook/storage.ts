import {
  exists,
  join,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
} from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"

import {
  BUILTIN_INPUT_PROFILES,
  BUILTIN_PLAYBOOKS,
} from "./builtin-manifest"
import {
  inputProfileSchema,
  playbookSchema,
  type InputProfile,
  type Playbook,
} from "./types"

async function userPlaybooksRoot(): Promise<string> {
  const { playbooksDir } = await getStoragePaths()
  const root = await join(playbooksDir, "user")
  if (!(await exists(root))) await mkdir(root, { recursive: true })
  return root
}

async function userProfilesRoot(): Promise<string> {
  const { inputProfilesDir } = await getStoragePaths()
  const root = await join(inputProfilesDir, "user")
  if (!(await exists(root))) await mkdir(root, { recursive: true })
  return root
}

export async function listInputProfiles(): Promise<InputProfile[]> {
  const byId = new Map<string, InputProfile>()
  for (const p of BUILTIN_INPUT_PROFILES) byId.set(p.id, p)

  const root = await userProfilesRoot()
  if (await exists(root)) {
    const entries = await readDir(root)
    for (const entry of entries) {
      if (!entry.name?.endsWith(".json")) continue
      const path = await join(root, entry.name)
      const raw = JSON.parse(await readTextFile(path)) as unknown
      const profile = inputProfileSchema.parse(raw)
      byId.set(profile.id, profile)
    }
  }

  return [...byId.values()]
}

export async function getInputProfile(id: string): Promise<InputProfile | null> {
  const all = await listInputProfiles()
  return all.find((p) => p.id === id) ?? null
}

export async function saveUserInputProfile(
  profile: InputProfile
): Promise<InputProfile> {
  const parsed = inputProfileSchema.parse(profile)
  const root = await userProfilesRoot()
  const path = await join(root, `${parsed.id}.json`)
  await writeTextFile(path, JSON.stringify(parsed, null, 2))
  return parsed
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const byId = new Map<string, Playbook>()
  for (const p of BUILTIN_PLAYBOOKS) byId.set(p.id, p)

  const root = await userPlaybooksRoot()
  if (await exists(root)) {
    const entries = await readDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory || !entry.name) continue
      const path = await join(root, entry.name, "playbook.json")
      if (!(await exists(path))) continue
      const raw = JSON.parse(await readTextFile(path)) as Record<string, unknown>
      const playbook = playbookSchema.parse({ ...raw, builtin: false })
      byId.set(playbook.id, playbook)
    }
  }

  return [...byId.values()]
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  const all = await listPlaybooks()
  return all.find((p) => p.id === id) ?? null
}

export async function saveUserPlaybook(playbook: Playbook): Promise<Playbook> {
  const parsed = playbookSchema.parse({ ...playbook, builtin: false })
  const root = await userPlaybooksRoot()
  const dir = await join(root, parsed.id)
  if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  const path = await join(dir, "playbook.json")
  await writeTextFile(path, JSON.stringify(parsed, null, 2))
  return parsed
}
