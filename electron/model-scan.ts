import fs from "node:fs/promises"
import path from "node:path"

import type { ModelDefinition } from "./types"

export const GGUF_PART_SUFFIX = ".gguf.part"

export type ModelsDirScan = {
  /** 文件名 → 字节数 */
  gguf: Map<string, number>
  parts: Map<string, { bytes: number }>
}

const INSTALLED_SIZE_RATIO = 0.9

export async function scanModelsDir(modelsDir: string): Promise<ModelsDirScan> {
  await fs.mkdir(modelsDir, { recursive: true })
  const entries = await fs.readdir(modelsDir, { withFileTypes: true })

  const gguf = new Map<string, number>()
  const parts = new Map<string, { bytes: number }>()

  const pendingGguf: { name: string; filePath: string }[] = []
  const partStats: { ggufName: string; filePath: string }[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const name = entry.name
    const lower = name.toLowerCase()
    if (lower.endsWith(GGUF_PART_SUFFIX)) {
      const ggufName = name.slice(0, -".part".length)
      partStats.push({ ggufName, filePath: path.join(modelsDir, name) })
      continue
    }
    if (lower.endsWith(".gguf")) {
      pendingGguf.push({ name, filePath: path.join(modelsDir, name) })
    }
  }

  await Promise.all([
    ...pendingGguf.map(async ({ name, filePath }) => {
      const stat = await fs.stat(filePath)
      gguf.set(name, stat.size)
    }),
    ...partStats.map(async ({ ggufName, filePath }) => {
      const stat = await fs.stat(filePath)
      parts.set(ggufName, { bytes: stat.size })
    }),
  ])

  return { gguf, parts }
}

export function modelFileCandidates(model: ModelDefinition): string[] {
  return [model.fileName, ...(model.aliases || [])]
}

function matchesExpectedSize(bytes: number, expectedBytes: number): boolean {
  if (expectedBytes <= 0) return true
  return bytes >= Math.floor(expectedBytes * INSTALLED_SIZE_RATIO)
}

export function findInstalledModelFile(
  model: ModelDefinition,
  modelsDir: string,
  scan: ModelsDirScan
): string | null {
  for (const name of modelFileCandidates(model)) {
    const bytes = scan.gguf.get(name)
    if (bytes == null) continue
    if (!matchesExpectedSize(bytes, model.sizeBytes)) continue
    return path.join(modelsDir, name)
  }
  return null
}

export function findPartForModel(
  model: ModelDefinition,
  scan: ModelsDirScan
): { fileName: string; bytes: number } | null {
  for (const name of modelFileCandidates(model)) {
    const part = scan.parts.get(name)
    if (part) return { fileName: name, ...part }
  }
  return null
}

export function invalidateModelScanCache(): void {}
