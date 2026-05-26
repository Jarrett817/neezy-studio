import type { ModelDefinition, ModelKind, ModelTier } from "../types"
import { EMBEDDING_DIM } from "../types"


const TIER_LABELS: Record<ModelTier, string> = {
  light: "轻量",
  balanced: "中等",
  performance: "高性能",
}

/** Ollama 库常见可 pull 名称（官方库无 JSON 列表接口时的补充） */
const CURATED_MODELS: { name: string; kind: ModelKind }[] = [
  { name: "qwen2.5:3b", kind: "chat" },
  { name: "qwen2.5:7b", kind: "chat" },
  { name: "qwen2.5:14b", kind: "chat" },
  { name: "llama3.2:3b", kind: "chat" },
  { name: "deepseek-r1:7b", kind: "chat" },
  { name: "gemma3:4b", kind: "chat" },
  { name: "ministral-3:3b", kind: "chat" },
  { name: "nomic-embed-text", kind: "embedding" },
  { name: "mxbai-embed-large", kind: "embedding" },
  { name: "bge-large", kind: "embedding" },
  { name: "qwen3-embedding", kind: "embedding" },
]

const MAX_RECOMMENDED_BYTES = 35 * 1024 ** 3

function withinRecommendedSize(sizeBytes: number, kind: ModelKind): boolean {
  if (kind === "embedding") return true
  return sizeBytes > 0 && sizeBytes <= MAX_RECOMMENDED_BYTES
}

function slugifyId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function inferModelKind(ollamaName: string): ModelKind {
  return /embed/i.test(ollamaName) ? "embedding" : "chat"
}

function parseParamBillions(ollamaName: string, parameterSize?: string): number | null {
  const fromDetail = parameterSize?.match(/([\d.]+)\s*B/i)?.[1]
  const fromName = ollamaName.match(/:(\d+(?:\.\d+)?)b\b/i)?.[1]
  const raw = fromDetail ?? fromName
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function inferTier(
  ollamaName: string,
  sizeBytes: number,
  parameterSize?: string
): ModelTier {
  const params = parseParamBillions(ollamaName, parameterSize)
  if (params != null) {
    if (params <= 3.5) return "light"
    if (params <= 9) return "balanced"
    return "performance"
  }
  const gb = sizeBytes / 1024 ** 3
  if (gb <= 3) return "light"
  if (gb <= 10) return "balanced"
  return "performance"
}

function estimateSizeBytes(ollamaName: string, knownSize?: number): number {
  if (knownSize && knownSize > 0) return knownSize
  const params = parseParamBillions(ollamaName, undefined)
  if (params != null) return Math.max(1, Math.round(params * 0.65 * 1024 ** 3))
  return 2 * 1024 ** 3
}

function minMemoryGbFromSize(sizeBytes: number): number {
  const gb = sizeBytes / 1024 ** 3
  if (gb <= 2) return 8
  if (gb <= 6) return 12
  if (gb <= 12) return 16
  return 24
}

function titleFromOllamaName(ollamaName: string): string {
  const [base, tag] = ollamaName.split(":")
  const label = base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  return tag && tag !== "latest" ? `${label} ${tag}` : label
}

export function definitionFromOllamaName(
  ollamaName: string,
  options: {
    kind?: ModelKind
    sizeBytes?: number
    parameterSize?: string
    catalogSection?: "recommended" | "local"
    subtitle?: string
    embeddingDim?: number
    compatibilityScore?: number
    isLocalOnly?: boolean
  } = {}
): ModelDefinition {
  const kind = options.kind ?? inferModelKind(ollamaName)
  const sizeBytes = estimateSizeBytes(ollamaName, options.sizeBytes)
  const tier = inferTier(ollamaName, sizeBytes, options.parameterSize)
  const embeddingDim =
    kind === "embedding"
      ? (options.embeddingDim ??
        (/nomic-embed-text(?!-v2)/i.test(ollamaName) ? EMBEDDING_DIM : undefined))
      : undefined

  return {
    id: slugifyId(ollamaName),
    kind,
    catalogSection: options.catalogSection ?? "recommended",
    tier,
    tierLabel: TIER_LABELS[tier],
    title: titleFromOllamaName(ollamaName),
    subtitle:
      options.subtitle ??
      (kind === "embedding" ? "Ollama 库 · Embedding" : "Ollama 库 · 对话"),
    modelUri: ollamaName,
    fileName: ollamaName,
    sizeLabel: formatBytes(sizeBytes),
    sizeBytes,
    minMemoryGb: minMemoryGbFromSize(sizeBytes),
    embeddingDim,
    compatibilityScore: options.compatibilityScore,
    fit: kind === "embedding" ? ["Embedding"] : ["对话"],
    isLocalOnly: options.isLocalOnly,
  }
}

export async function buildRecommendedCatalog(): Promise<ModelDefinition[]> {
  const byName = new Map<string, ModelDefinition>()

  const add = (def: ModelDefinition) => {
    if (!withinRecommendedSize(def.sizeBytes, def.kind)) return
    byName.set(def.fileName, def)
  }

  for (const { name, kind } of CURATED_MODELS) {
    add(definitionFromOllamaName(name, { kind }))
  }

  return [...byName.values()].sort((a, b) => a.sizeBytes - b.sizeBytes)
}
