import type { AbortableAsyncIterator, ProgressResponse } from "ollama"

import type { ModelDefinition, ModelKind, ModelTier } from "../types"
import { getOllamaClient } from "./client"
import { ensureOllama } from "./lifecycle"
import { buildRecommendedCatalog, definitionFromOllamaName } from "./library"
import {
  isModelRefInstalled,
  resolveInstalledRef,
} from "./model-ref"
import { embeddingDimFromShow, showOllamaModel } from "./model-info"

const TIER_LABELS: Record<ModelTier, string> = {
  light: "轻量",
  balanced: "中等",
  performance: "高性能",
}

let registry: ModelDefinition[] = []
let registryReady: Promise<void> | null = null
let installedNames = new Set<string>()
let localTagModels: { name: string; size: number; details?: { parameter_size?: string } }[] =
  []

export async function refreshInstalledNames(): Promise<Set<string>> {
  await ensureOllama()
  const { models } = await getOllamaClient().list()
  localTagModels = models.map((m) => ({
    name: m.name,
    size: m.size,
    details: m.details,
  }))
  installedNames = new Set(localTagModels.map((m) => m.name))
  return installedNames
}

export function getInstalledNames(): Set<string> {
  return installedNames
}

function buildLocalDefinitions(recommended: ModelDefinition[]): ModelDefinition[] {
  const recNames = new Set(recommended.map((m) => m.fileName))
  const out: ModelDefinition[] = []

  for (const tag of localTagModels) {
    if (recNames.has(tag.name)) continue
    const kind = /embed/i.test(tag.name) ? "embedding" : "chat"
    out.push(
      definitionFromOllamaName(tag.name, {
        kind,
        sizeBytes: tag.size,
        parameterSize: tag.details?.parameter_size,
        catalogSection: "local",
        subtitle: "本机 Ollama 已安装",
        isLocalOnly: true,
      })
    )
  }

  return out.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

async function enrichInstalledWithShow(models: ModelDefinition[]): Promise<void> {
  const installed = models.filter((m) => isModelInstalled(m.fileName))
  await Promise.all(
    installed.slice(0, 12).map(async (model) => {
      const ref = resolveInstalledRef(model.fileName, installedNames) ?? model.fileName
      const show = await showOllamaModel(ref)
      if (!show) return
      const dim = embeddingDimFromShow(show)
      if (dim) model.embeddingDim = dim
      const ps = show.details?.parameter_size
      if (ps) {
        model.tier = inferTierFromShow(model, ps)
        model.tierLabel = TIER_LABELS[model.tier]
      }
    })
  )
}

function inferTierFromShow(model: ModelDefinition, parameterSize: string): ModelTier {
  const params = parameterSize.match(/([\d.]+)\s*B/i)?.[1]
  const n = params ? Number(params) : NaN
  if (Number.isFinite(n)) {
    if (n <= 3.5) return "light"
    if (n <= 9) return "balanced"
    return "performance"
  }
  return model.tier
}

async function rebuildRegistry(): Promise<void> {
  await ensureOllama().catch(() => {})
  await refreshInstalledNames().catch(() => {})

  let recommended: ModelDefinition[] = []
  try {
    recommended = await buildRecommendedCatalog()
  } catch (error) {
    console.warn("[ollama/catalog] recommended catalog failed:", error)
  }

  registry = [...recommended, ...buildLocalDefinitions(recommended)]
  await enrichInstalledWithShow(registry).catch(() => {})
}

export async function ensureModelRegistry(): Promise<void> {
  if (!registryReady) {
    registryReady = rebuildRegistry().finally(() => {
      registryReady = null
    })
  }
  await registryReady
}

export async function refreshModelCatalog(): Promise<void> {
  await rebuildRegistry()
}

export function findCatalogEntry(modelId: string): ModelDefinition | null {
  return registry.find((e) => e.id === modelId) ?? null
}

export function findCatalogEntryByName(name: string): ModelDefinition | null {
  return registry.find((e) => e.fileName === name || e.id === name) ?? null
}

export function getModelsByKind(kind: ModelKind): ModelDefinition[] {
  return registry.filter((e) => e.kind === kind)
}

export function getAllModelDefinitions(): ModelDefinition[] {
  return registry
}

export function modelToCatalogItem(
  model: ModelDefinition,
  extra: {
    installed: boolean
    resolvedRef?: string | null
    status: "available" | "ready" | "downloading" | "error"
    progress: number | null
    downloadedBytes: number
    totalBytes: number
    error?: string
    cancellable?: boolean
  }
) {
  const ollamaRef = extra.resolvedRef ?? (extra.installed ? model.fileName : null)
  return {
    ...model,
    installed: extra.installed,
    path: ollamaRef,
    status: extra.status,
    progress: extra.progress,
    downloadedBytes: extra.downloadedBytes,
    totalBytes: extra.totalBytes,
    error: extra.error,
    cancellable: extra.cancellable,
  }
}

export function catalogItemFromDefinition(
  model: ModelDefinition,
  status: "available" | "ready" | "downloading" | "error" = "available"
) {
  const resolvedRef = resolveInstalledRef(model.fileName, installedNames)
  const installed = resolvedRef !== null
  return modelToCatalogItem(model, {
    installed,
    resolvedRef,
    status: installed ? "ready" : status,
    progress: null,
    downloadedBytes: 0,
    totalBytes: model.sizeBytes,
  })
}

const activePulls = new Map<
  string,
  { stream: AbortableAsyncIterator<ProgressResponse>; progress: number }
>()

/** 应用内「下载」= 调用 Ollama pull，落盘由 Ollama 管理 */
export async function pullModel(
  ollamaName: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  await ensureOllama()
  const stream = await getOllamaClient().pull({ model: ollamaName, stream: true })
  activePulls.set(ollamaName, { stream, progress: 0 })

  try {
    for await (const chunk of stream) {
      if (chunk.total > 0) {
        const pct = Math.min(100, Math.round((chunk.completed / chunk.total) * 100))
        activePulls.get(ollamaName)!.progress = pct
        onProgress?.(pct)
      }
      if (chunk.status === "success") break
    }
    await refreshInstalledNames()
    await rebuildRegistry()
  } finally {
    activePulls.delete(ollamaName)
  }
}

export function cancelPull(ollamaName: string): void {
  activePulls.get(ollamaName)?.stream.abort()
  activePulls.delete(ollamaName)
}

export function getPullProgress(ollamaName: string): number | null {
  return activePulls.get(ollamaName)?.progress ?? null
}

export async function deleteOllamaModel(ollamaName: string): Promise<void> {
  await ensureOllama()
  const resolved = resolveInstalledRef(ollamaName, installedNames) ?? ollamaName
  await getOllamaClient().delete({ model: resolved })
  await refreshInstalledNames()
  await rebuildRegistry()
}

export function isModelInstalled(ollamaName: string): boolean {
  return isModelRefInstalled(ollamaName, installedNames)
}

export function resolveInstalledModelRef(ollamaName: string): string | null {
  return resolveInstalledRef(ollamaName, installedNames)
}
