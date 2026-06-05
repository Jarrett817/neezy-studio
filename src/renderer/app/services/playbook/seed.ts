import { exists, join, mkdir } from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"

import { seedBuiltinScenes } from "./storage"

export async function ensurePlaybookDirs(): Promise<void> {
  const { playbooksDir, inputProfilesDir } = await getStoragePaths()
  for (const dir of [playbooksDir, inputProfilesDir]) {
    if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  }
  const draftsDir = await join(playbooksDir, "drafts")
  if (!(await exists(draftsDir))) await mkdir(draftsDir, { recursive: true })
  await seedBuiltinScenes()
}
