import fs from "node:fs/promises"
import path from "node:path"
import type { App } from "electron"
import { getPiAgentDir } from "./pi-agent-env"

export function getAgentDirAgentsMdPath(app: App): string {
  return path.join(getPiAgentDir(app), "AGENTS.md")
}

export async function readAgentDirAgentsMd(app: App): Promise<{
  path: string
  content: string
}> {
  const filePath = getAgentDirAgentsMdPath(app)
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return { path: filePath, content }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: filePath, content: "" }
    }
    throw error
  }
}

export async function writeAgentDirAgentsMd(
  app: App,
  content: string
): Promise<void> {
  const filePath = getAgentDirAgentsMdPath(app)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf-8")
}
