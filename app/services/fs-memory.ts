// MD 文件操作 - 前端 via tauri-plugin-fs

import { readTextFile, writeTextFile, mkdir, exists, remove } from "@tauri-apps/plugin-fs"
import { appDataDir, join } from "@tauri-apps/api/path"

const MEMORIES_DIR = "memories"

// 获取记忆目录路径
export async function getMemoriesDir(): Promise<string> {
  const baseDir = await appDataDir()
  return await join(baseDir, MEMORIES_DIR)
}

// 确保目录存在
export async function ensureMemoriesDir(): Promise<string> {
  const dir = await getMemoriesDir()
  const dirExists = await exists(dir)
  if (!dirExists) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

// 读取 MD 文件内容
export async function readMemoryFile(filePath: string): Promise<string> {
  return await readTextFile(filePath)
}

// 写入 MD 文件
export async function writeMemoryFile(title: string, content: string): Promise<{
  file_path: string
  created_at: number
}> {
  const dir = await ensureMemoriesDir()
  const now = Date.now()
  const safeTitle = title
    .replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
  const filename = `${now}_${safeTitle}.md`
  const filePath = await join(dir, filename)
  const mdContent = `# ${title}\n\n${content}\n`
  await writeTextFile(filePath, mdContent)
  return {
    file_path: filePath,
    created_at: now,
  }
}

// 删除 MD 文件
export async function deleteMemoryFile(filePath: string): Promise<void> {
  const fileExists = await exists(filePath)
  if (fileExists) {
    await remove(filePath)
  }
}
