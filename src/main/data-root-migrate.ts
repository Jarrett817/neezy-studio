import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"

const DB_FILES = ["memories.db", "memories.db-wal", "memories.db-shm"] as const

const DATA_DIRS = [
  "memories",
  "personas",
  "skills",
  "playbooks",
  "input-profiles",
  "models",
] as const

export type DataRootMigrationResult = {
  from: string
  to: string
  moved: string[]
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function dirHasContent(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir)
    return entries.length > 0
  } catch {
    return false
  }
}

async function targetHasExistingData(targetRoot: string): Promise<boolean> {
  for (const file of DB_FILES) {
    if (fsSync.existsSync(path.join(targetRoot, file))) return true
  }
  for (const dir of DATA_DIRS) {
    if (await dirHasContent(path.join(targetRoot, dir))) return true
  }
  return false
}

async function hasSourceData(sourceRoot: string): Promise<boolean> {
  for (const file of DB_FILES) {
    if (fsSync.existsSync(path.join(sourceRoot, file))) return true
  }
  for (const dir of DATA_DIRS) {
    if (await dirHasContent(path.join(sourceRoot, dir))) return true
  }
  return false
}

async function movePath(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  try {
    await fs.rename(src, dest)
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : ""
    if (code === "EXDEV" || code === "EPERM") {
      await fs.cp(src, dest, { recursive: true, force: true })
      await fs.rm(src, { recursive: true, force: true })
      return
    }
    throw error
  }
}

/** 将旧 dataRoot 下的库、目录与模型文件迁移到新目录（目标须为空） */
export async function migrateDataRoot(
  fromRoot: string,
  toRoot: string
): Promise<DataRootMigrationResult> {
  const from = path.resolve(fromRoot)
  const to = path.resolve(toRoot)
  if (from === to) {
    return { from, to, moved: [] }
  }

  if (!(await hasSourceData(from))) {
    return { from, to, moved: [] }
  }

  if (await targetHasExistingData(to)) {
    throw new Error(
      "目标目录已包含 memories.db 或其它数据文件，请选择空目录，或先手动合并/备份后再保存。"
    )
  }

  await fs.mkdir(to, { recursive: true })
  const moved: string[] = []

  for (const file of DB_FILES) {
    const src = path.join(from, file)
    if (!fsSync.existsSync(src)) continue
    await movePath(src, path.join(to, file))
    moved.push(file)
  }

  for (const dir of DATA_DIRS) {
    const src = path.join(from, dir)
    if (!(await dirHasContent(src))) continue
    await movePath(src, path.join(to, dir))
    moved.push(`${dir}/`)
  }

  return { from, to, moved }
}
