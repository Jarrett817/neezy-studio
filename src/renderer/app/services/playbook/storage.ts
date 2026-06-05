import {
  exists,
  join,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"

import { BUILTIN_SCENES } from "./builtin-manifest"
import {
  inputProfileSchema,
  playbookSchema,
  sceneSchema,
  type InputProfile,
  type Playbook,
  type Scene,
} from "./types"

async function scenesRoot(): Promise<string> {
  const { playbooksDir } = await getStoragePaths()
  const root = await join(playbooksDir, "scenes")
  if (!(await exists(root))) await mkdir(root, { recursive: true })
  return root
}

async function readSceneFile(path: string): Promise<Scene> {
  const raw = JSON.parse(await readTextFile(path)) as unknown
  return sceneSchema.parse(raw)
}

export async function listScenes(): Promise<Scene[]> {
  const root = await scenesRoot()
  if (!(await exists(root))) return []

  const entries = await readDir(root)
  const scenes: Scene[] = []
  for (const entry of entries) {
    if (!entry.name?.endsWith(".json")) continue
    scenes.push(await readSceneFile(await join(root, entry.name)))
  }
  return scenes.sort((a, b) => a.playbook.name.localeCompare(b.playbook.name))
}

export async function getScene(playbookId: string): Promise<Scene | null> {
  const root = await scenesRoot()
  const path = await join(root, `${playbookId}.json`)
  if (!(await exists(path))) return null
  return readSceneFile(path)
}

export async function saveScene(scene: Scene): Promise<Scene> {
  const parsed = sceneSchema.parse({
    playbook: playbookSchema.parse({
      ...scene.playbook,
      builtin: scene.playbook.builtin ?? false,
    }),
    inputProfile: inputProfileSchema.parse({
      ...scene.inputProfile,
      updatedAt: Date.now(),
    }),
  })
  parsed.inputProfile.id = parsed.playbook.inputProfileId

  const root = await scenesRoot()
  const path = await join(root, `${parsed.playbook.id}.json`)
  await writeTextFile(path, JSON.stringify(parsed, null, 2))
  return parsed
}

export async function deleteScene(playbookId: string): Promise<void> {
  const scene = await getScene(playbookId)
  if (scene?.playbook.builtin) {
    throw new Error("内置场景不可删除")
  }
  const root = await scenesRoot()
  const path = await join(root, `${playbookId}.json`)
  if (await exists(path)) await remove(path)
}

export async function getInputProfile(id: string): Promise<InputProfile | null> {
  for (const scene of await listScenes()) {
    if (
      scene.inputProfile.id === id ||
      scene.playbook.inputProfileId === id
    ) {
      return scene.inputProfile
    }
  }
  return null
}

export async function listPlaybooks(): Promise<Playbook[]> {
  return (await listScenes()).map((scene) => scene.playbook)
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  const scene = await getScene(id)
  return scene?.playbook ?? null
}

export async function saveUserPlaybook(playbook: Playbook): Promise<Playbook> {
  const existing = await getScene(playbook.id)
  if (!existing) {
    throw new Error(`未找到场景: ${playbook.id}`)
  }
  const saved = await saveScene({
    playbook: playbookSchema.parse({ ...playbook, builtin: false }),
    inputProfile: existing.inputProfile,
  })
  return saved.playbook
}

export async function saveUserScene(scene: Scene): Promise<Scene> {
  return saveScene({
    ...scene,
    playbook: { ...scene.playbook, builtin: false },
  })
}

export async function deleteUserPlaybook(id: string): Promise<void> {
  await deleteScene(id)
}

export async function listUserPlaybooks(): Promise<Playbook[]> {
  const all = await listPlaybooks()
  return all.filter((p) => !p.builtin)
}

export type PlaybookSource = "builtin" | "user"
export async function listPlaybooksGrouped(): Promise<{
  builtin: Playbook[]
  user: Playbook[]
}> {
  const all = await listPlaybooks()
  return {
    builtin: all.filter((p) => p.builtin),
    user: all.filter((p) => !p.builtin),
  }
}

export async function seedBuiltinScenes(): Promise<void> {
  const root = await scenesRoot()
  for (const scene of BUILTIN_SCENES) {
    const path = await join(root, `${scene.playbook.id}.json`)
    if (await exists(path)) continue
    await writeTextFile(path, JSON.stringify(scene, null, 2))
  }
}
