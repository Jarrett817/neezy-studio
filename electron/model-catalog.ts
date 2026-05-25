import path from "node:path"

import type { GgufInsights } from "node-llama-cpp"

import {
  collectMultiPartDownloadUris,
} from "./model-download"
import { resolveModelFileNamesFromUri } from "./model-filename"
import { importNlcDistModule } from "./nlc-dist-loader"
import {
  getDefaultNlcInsightsTuning,
  getInsightsCompatibilityOptions,
} from "./nlc-insights-options"
import { acquireLlama, getLlamaModule } from "./node-llama-runtime"
import * as modelScan from "./model-scan"
import type {
  CatalogSection,
  ModelDefinition,
  ModelKind,
  ModelTier,
} from "./types"

const URI_SCORE_TIMEOUT_MS = 45_000

type RegistryPhase = "idle" | "local" | "complete"

let registryPhase: RegistryPhase = "idle"
let resolveLocalReady: (() => void) | null = null
let resolveCompleteReady: (() => void) | null = null
let localReady = Promise.resolve()
let completeReady = Promise.resolve()
let onCatalogUpdated: (() => void) | null = null

export function setModelCatalogUpdateHandler(handler: (() => void) | null): void {
  onCatalogUpdated = handler
}

function notifyCatalogUpdated(): void {
  onCatalogUpdated?.()
}

function resetRegistryWaits(): void {
  registryPhase = "idle"
  localReady = new Promise<void>((resolve) => {
    resolveLocalReady = resolve
  })
  completeReady = new Promise<void>((resolve) => {
    resolveCompleteReady = resolve
  })
}

function markRegistryPhase(phase: RegistryPhase): void {
  registryPhase = phase
  if (phase === "local" || phase === "complete") {
    resolveLocalReady?.()
    resolveLocalReady = null
  }
  if (phase === "complete") {
    resolveCompleteReady?.()
    resolveCompleteReady = null
  }
}

type NlcModelRecommendation = {
  name: string
  abilities: string[]
  description?: string
  fileOptions: string[]
}

type UriPick = {
  uri: string
  ggufInsights: GgufInsights
  compatibilityScore: number
  resolvedContextSize: number
}

const TIER_LABELS: Record<ModelTier, string> = {
  light: "轻量",
  balanced: "中等",
  performance: "高性能",
}

const ABILITY_LABELS: Record<string, string> = {
  chat: "对话",
  complete: "补全",
  reasoning: "推理",
  functionCalling: "工具调用",
  code: "代码",
  infill: "填充",
}

/** node-llama-cpp CLI 未维护 Embedding 推荐表，沿用官方 HF URI 格式 */
const EMBEDDING_RECOMMENDATIONS: NlcModelRecommendation[] = [
  {
    name: "Nomic Embed Text Q4",
    abilities: [],
    description:
      "Nomic embedding model (768-dim). Small and fast for memory search.",
    fileOptions: ["hf:nomic-ai/nomic-embed-text-v1.5-GGUF:Q4_K_M"],
  },
  {
    name: "Nomic Embed Text Q8",
    abilities: [],
    description:
      "Nomic embedding model (768-dim). Higher quality vectors than Q4.",
    fileOptions: ["hf:nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0"],
  },
  {
    name: "Nomic Embed Text F16",
    abilities: [],
    description:
      "Nomic embedding model (768-dim). Highest precision, larger file.",
    fileOptions: ["hf:nomic-ai/nomic-embed-text-v1.5-GGUF:f16"],
  },
]

let registry: ModelDefinition[] = []
let registryReady: Promise<void> | null = null

function slugifyId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return base || "model"
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function tierFromModelSize(sizeBytes: number): ModelTier {
  if (sizeBytes < 1.5e9) return "light"
  if (sizeBytes < 12e9) return "balanced"
  return "performance"
}

function minMemoryGbFromSize(sizeBytes: number): number {
  if (sizeBytes < 1e9) return 8
  if (sizeBytes < 4e9) return 12
  if (sizeBytes < 15e9) return 16
  return 24
}

function abilitiesToFit(abilities: string[]): string[] {
  return abilities
    .map((a) => ABILITY_LABELS[a] ?? a)
    .filter((label, i, arr) => arr.indexOf(label) === i)
    .slice(0, 4)
}

function subtitleFromDescription(description: string | undefined, name: string): string {
  if (!description) return name
  const line = description.split("\n").find((l) => l.trim().length > 0)?.trim()
  return line && line.length <= 120 ? line : name
}

async function loadRecommendedModelsList(): Promise<NlcModelRecommendation[]> {
  const mod = await importNlcDistModule<{ recommendedModels: NlcModelRecommendation[] }>(
    "cli",
    "recommendedModels.js"
  )
  return mod.recommendedModels ?? []
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function pickBestModelUri(
  potentialUris: string[],
  llama: Awaited<ReturnType<typeof acquireLlama>>
): Promise<UriPick | null> {
  const { readGgufFileInfo, GgufInsights } = await getLlamaModule()
  const tuning = getDefaultNlcInsightsTuning()
  let best: UriPick | null = null

  for (const uri of potentialUris) {
    try {
      const ggufFileInfo = await withTimeout(
        readGgufFileInfo(uri, { sourceType: "network" }),
        URI_SCORE_TIMEOUT_MS
      )
      const ggufInsights = await GgufInsights.from(ggufFileInfo, llama)
      const compatibilityScore =
        await ggufInsights.configurationResolver.scoreModelConfigurationCompatibility(
          getInsightsCompatibilityOptions(ggufInsights, tuning)
        )
      const score = compatibilityScore.compatibilityScore
      if (best === null || score > best.compatibilityScore) {
        best = {
          uri,
          ggufInsights,
          compatibilityScore: score,
          resolvedContextSize: compatibilityScore.resolvedValues.contextSize,
        }
        if (score >= 1) break
      }
    } catch {
      // try next quant / URI
    }
  }

  return best
}

async function definitionFromPick(
  rec: NlcModelRecommendation,
  kind: ModelKind,
  pick: UriPick,
  candidateUris: string[],
  catalogSection?: CatalogSection
): Promise<ModelDefinition> {
  const sizeBytes = pick.ggufInsights.modelSize
  const tier = tierFromModelSize(sizeBytes)
  const { fileName, aliases } = await resolveModelFileNamesFromUri(pick.uri)
  const baseId = slugifyId(rec.name)

  return {
    id: baseId,
    kind,
    ...(catalogSection ? { catalogSection } : {}),
    tier,
    tierLabel: TIER_LABELS[tier],
    title: rec.name,
    subtitle: subtitleFromDescription(rec.description, rec.name),
    description: rec.description,
    modelUri: pick.uri,
    candidateUris,
    downloadUris: collectMultiPartDownloadUris(pick.uri, candidateUris),
    fileName,
    aliases: aliases.length > 0 ? aliases : undefined,
    abilities: rec.abilities,
    sizeLabel: formatBytes(sizeBytes),
    sizeBytes: Math.max(1, sizeBytes),
    minMemoryGb: minMemoryGbFromSize(sizeBytes),
    compatibilityScore: pick.compatibilityScore,
    resolvedContextSize: pick.resolvedContextSize,
    embeddingDim: kind === "embedding" ? 768 : undefined,
    fit: abilitiesToFit(rec.abilities),
  }
}

async function buildChatDefinitions(
  llama: Awaited<ReturnType<typeof acquireLlama>>
): Promise<ModelDefinition[]> {
  const recommendedModels = await loadRecommendedModelsList()
  const out: ModelDefinition[] = []

  for (const rec of recommendedModels) {
    const uris = rec.fileOptions
    if (uris.length === 0) continue
    try {
      const pick = await pickBestModelUri(uris, llama)
      if (!pick) continue
      out.push(await definitionFromPick(rec, "chat", pick, uris, "recommended"))
    } catch (error) {
      console.warn(`[model-catalog] skip recommended "${rec.name}":`, error)
    }
  }

  return out.sort(
    (a, b) =>
      (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0) ||
      a.sizeBytes - b.sizeBytes
  )
}

async function buildEmbeddingDefinitions(
  llama: Awaited<ReturnType<typeof acquireLlama>>
): Promise<ModelDefinition[]> {
  const out: ModelDefinition[] = []

  for (const rec of EMBEDDING_RECOMMENDATIONS) {
    const uris = rec.fileOptions
    try {
      const pick = await pickBestModelUri(uris, llama)
      if (!pick) continue
      out.push(await definitionFromPick(rec, "embedding", pick, uris))
    } catch (error) {
      console.warn(`[model-catalog] skip embedding "${rec.name}":`, error)
    }
  }

  return out
}

async function buildLocalChatDefinitions(
  modelsDir: string,
  scan: modelScan.ModelsDirScan,
  llama: Awaited<ReturnType<typeof acquireLlama>>
): Promise<ModelDefinition[]> {
  const { readGgufFileInfo, GgufInsights } = await getLlamaModule()
  const tuning = getDefaultNlcInsightsTuning()
  const local: ModelDefinition[] = []

  for (const fileName of scan.gguf.keys()) {
    const filePath = path.join(modelsDir, fileName)
    try {
      const ggufFileInfo = await readGgufFileInfo(filePath, { sourceType: "filesystem" })
      const ggufInsights = await GgufInsights.from(ggufFileInfo, llama)
      const scored =
        await ggufInsights.configurationResolver.scoreModelConfigurationCompatibility(
          getInsightsCompatibilityOptions(ggufInsights, tuning)
        )
      const title = fileName.replace(/\.gguf$/i, "")
      const sizeBytes = ggufInsights.modelSize
      const tier = tierFromModelSize(sizeBytes)
      local.push({
        id: `local-${slugifyId(title)}`,
        kind: "chat",
        catalogSection: "local",
        tier,
        tierLabel: TIER_LABELS[tier],
        title,
        subtitle: "本机 models 目录中的 GGUF",
        modelUri: filePath,
        fileName,
        sizeLabel: formatBytes(sizeBytes),
        sizeBytes: Math.max(1, sizeBytes),
        minMemoryGb: minMemoryGbFromSize(sizeBytes),
        compatibilityScore: scored.compatibilityScore,
        resolvedContextSize: scored.resolvedValues.contextSize,
        fit: ["本机模型"],
        isLocalOnly: true,
      })
    } catch {
      // skip unreadable gguf
    }
  }

  return local.sort((a, b) => (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0))
}

async function rebuildRegistry(modelsDir: string): Promise<void> {
  registryPhase = "idle"
  const llama = await acquireLlama(false)
  const scan = await modelScan.scanModelsDir(modelsDir)

  const localChat = await buildLocalChatDefinitions(modelsDir, scan, llama)
  let embedding: ModelDefinition[] = []
  try {
    embedding = await buildEmbeddingDefinitions(llama)
  } catch (error) {
    console.warn("[model-catalog] embedding catalog failed:", error)
  }

  registry = [...localChat, ...embedding]
  markRegistryPhase("local")
  notifyCatalogUpdated()

  try {
    const chat = await buildChatDefinitions(llama)
    registry = [...chat, ...localChat, ...embedding]
  } catch (error) {
    console.warn("[model-catalog] recommended catalog failed:", error)
  }

  markRegistryPhase("complete")
  notifyCatalogUpdated()
}

export function invalidateModelCatalogCache(): void {
  registry = []
  registryReady = null
  resetRegistryWaits()
  modelScan.invalidateModelScanCache()
}

export async function ensureModelRegistry(
  modelsDir: string,
  options: { waitForRecommended?: boolean } = {}
): Promise<void> {
  const waitForRecommended = options.waitForRecommended === true
  if (registryPhase === "complete") return
  if (!registryReady) {
    resetRegistryWaits()
    registryReady = rebuildRegistry(modelsDir).finally(() => {
      registryReady = null
    })
  }
  await localReady
  if (waitForRecommended) {
    await completeReady
  }
}

export function getModelsByKind(kind: ModelKind): ModelDefinition[] {
  return registry.filter((m) => m.kind === kind)
}

export function findModel(modelId: string): ModelDefinition | null {
  return registry.find((m) => m.id === modelId) ?? null
}

export function getKnownModelFileNames(): string[] {
  return registry.flatMap((m) => [m.fileName, ...(m.aliases ?? [])])
}

export async function getAllModels(
  modelsDir: string,
  options: { waitForRecommended?: boolean } = {}
): Promise<ModelDefinition[]> {
  await ensureModelRegistry(modelsDir, options)
  return registry
}

/** @deprecated 同步访问；请先调用 ensureModelRegistry */
export const ALL_MODELS: ModelDefinition[] = []
