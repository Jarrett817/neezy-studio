import fs from "node:fs/promises"
import path from "node:path"

import type { ModelDefinition } from "./types"

export const GGUF_PART_SUFFIX = ".gguf.part"

export type ModelsDirScan = {
  gguf: Set<string>
  parts: Map<string, { bytes: number }>
}

export async function scanModelsDir(modelsDir: string): Promise<ModelsDirScan> {
  await fs.mkdir(modelsDir, { recursive: true })
  const entries = await fs.readdir(modelsDir, { withFileTypes: true })

  const gguf = new Set<string>()
  const parts = new Map<string, { bytes: number }>()

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
      gguf.add(name)
    }
  }

  await Promise.all(
    partStats.map(async ({ ggufName, filePath }) => {
      const stat = await fs.stat(filePath)
      parts.set(ggufName, { bytes: stat.size })
    })
  )

  return { gguf, parts }
}

export function modelFileCandidates(model: ModelDefinition): string[] {
  return [model.fileName, ...(model.aliases || [])]
}

export function findInstalledModelFile(
  model: ModelDefinition,
  modelsDir: string,
  scan: ModelsDirScan
): string | null {
  for (const name of modelFileCandidates(model)) {
    if (scan.gguf.has(name)) return path.join(modelsDir, name)
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
