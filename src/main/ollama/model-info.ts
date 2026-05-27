import type { ShowResponse } from "ollama"

import { getOllamaClient } from "./client"
import { ensureOllama } from "./lifecycle"

export async function showOllamaModel(name: string): Promise<ShowResponse | null> {
  await ensureOllama()
  try {
    return await getOllamaClient().show({ model: name })
  } catch {
    return null
  }
}

export async function listRunningModels() {
  await ensureOllama()
  try {
    const data = await getOllamaClient().ps()
    return data.models ?? []
  } catch {
    return []
  }
}

export function modelSupportsToolsFromShow(show: ShowResponse | null): boolean {
  const caps = show?.capabilities
  if (!caps?.length) return false
  return caps.some((c) => c === "tools" || c === "tool_use")
}

/** show 无 capabilities 时的保守推断 */
export function modelSupportsToolsHeuristic(modelName: string): boolean {
  const n = modelName.toLowerCase()
  if (/embed/i.test(n)) return false
  if (n.includes("deepseek-r1") || n.includes("r1-distill")) return false
  return (
    n.includes("llama3.1") ||
    n.includes("llama3.2") ||
    n.includes("llama3.3") ||
    n.includes("mistral") ||
    n.includes("qwen2.5") ||
    n.includes("qwen3") ||
    n.includes("command-r")
  )
}

export function embeddingDimFromShow(show: ShowResponse | null): number | undefined {
  const info = show?.model_info
  if (!info) return undefined
  const entries =
    info instanceof Map ? [...info.entries()] : Object.entries(info as Record<string, unknown>)
  for (const [key, value] of entries) {
    if (!/embedding_length/i.test(key)) continue
    const n = typeof value === "number" ? value : Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}
