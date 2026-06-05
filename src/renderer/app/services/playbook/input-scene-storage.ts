import {
  exists,
  join,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"

async function draftsRoot(): Promise<string> {
  const { playbooksDir } = await getStoragePaths()
  const root = await join(playbooksDir, "drafts")
  if (!(await exists(root))) await mkdir(root, { recursive: true })
  return root
}

export async function loadInputSceneSlots(
  profileId: string
): Promise<Record<string, unknown> | null> {
  try {
    const root = await draftsRoot()
    const path = await join(root, `${profileId}.json`)
    if (!(await exists(path))) return null
    const raw = JSON.parse(await readTextFile(path)) as unknown
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    return raw as Record<string, unknown>
  } catch {
    return null
  }
}

export async function saveInputSceneSlots(
  profileId: string,
  values: Record<string, unknown>
): Promise<void> {
  const root = await draftsRoot()
  const path = await join(root, `${profileId}.json`)
  await writeTextFile(path, JSON.stringify(values, null, 2))
}

export async function clearInputSceneSlots(profileId: string): Promise<void> {
  const root = await draftsRoot()
  const path = await join(root, `${profileId}.json`)
  if (await exists(path)) await remove(path)
}

/** @deprecated 使用 loadInputSceneSlots */
export async function loadLastPlaybookSlots(
  profileId: string
): Promise<Record<string, unknown> | null> {
  return loadInputSceneSlots(profileId)
}

/** @deprecated 使用 saveInputSceneSlots */
export async function saveLastPlaybookSlots(
  profileId: string,
  values: Record<string, unknown>
): Promise<void> {
  await saveInputSceneSlots(profileId, values)
}
