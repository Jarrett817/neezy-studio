import { app } from "electron"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { LlamaEmbeddingContext } from "node-llama-cpp"
import { getLlama, LlamaLogLevel } from "node-llama-cpp"

import { EMBEDDING_DIM } from "./types"
import { log } from "./logger"
import { resolveStoragePaths } from "./storage-paths"

/** 与 libsql F32_BLOB(384) 一致 · sentence-transformers/all-MiniLM-L6-v2 */
export const BUNDLED_EMBED_FILENAME = "all-minilm-l6-v2_q8_0.gguf"

/** 保留参数供 IPC；MiniLM 无需 task 前缀 */
export type EmbedPurpose = "query" | "document"

let embedContext: LlamaEmbeddingContext | null = null
let initPromise: Promise<void> | null = null
let llamaInstance: Awaited<ReturnType<typeof getLlama>> | null = null

async function getEmbeddingLlama(): Promise<Awaited<ReturnType<typeof getLlama>>> {
  if (llamaInstance) return llamaInstance
  llamaInstance = await getLlama({
    logLevel: LlamaLogLevel.error,
    logger: (level, message) => {
      if (level === LlamaLogLevel.error || level === LlamaLogLevel.fatal) {
        log.error("[node-llama-cpp]", message)
      }
    },
  })
  return llamaInstance
}

function projectResourcesDir(): string {
  const mainDir = path.dirname(fileURLToPath(import.meta.url))
  return path.join(mainDir, "../../resources/embeddings")
}

function candidatePaths(modelsDir: string): string[] {
  const list = [
    path.join(modelsDir, "bundled", BUNDLED_EMBED_FILENAME),
    path.join(projectResourcesDir(), BUNDLED_EMBED_FILENAME),
  ]
  if (process.resourcesPath) {
    list.unshift(path.join(process.resourcesPath, "embeddings", BUNDLED_EMBED_FILENAME))
  }
  return list
}

export function resolveBundledEmbedModelPath(): string | null {
  const modelsDir = resolveStoragePaths(app).modelsDir
  for (const p of candidatePaths(modelsDir)) {
    if (fsSync.existsSync(p)) return p
  }
  return null
}

async function ensureModelOnDisk(modelsDir: string): Promise<string> {
  const target = path.join(modelsDir, "bundled", BUNDLED_EMBED_FILENAME)
  if (fsSync.existsSync(target)) return target

  for (const src of candidatePaths(modelsDir)) {
    if (src === target) continue
    if (!fsSync.existsSync(src)) continue
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(src, target)
    return target
  }

  throw new Error(
    `内置 Embedding 模型缺失。请将 ${BUNDLED_EMBED_FILENAME} 放到 resources/embeddings/ 后重新构建。`
  )
}

export async function initBundledEmbedding(): Promise<void> {
  if (embedContext) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    const modelsDir = resolveStoragePaths(app).modelsDir
    const modelPath = await ensureModelOnDisk(modelsDir)
    const llama = await getEmbeddingLlama()
    const model = await llama.loadModel({ modelPath })
    embedContext = await model.createEmbeddingContext()
    log.info("[embedding] 内置模型已加载:", modelPath)
  })()

  try {
    await initPromise
  } catch (error) {
    initPromise = null
    throw error
  }
}

function normalize(vec: readonly number[]): number[] {
  if (vec.length === EMBEDDING_DIM) return [...vec]
  if (vec.length > EMBEDDING_DIM) return vec.slice(0, EMBEDDING_DIM)
  return [...vec, ...new Array(EMBEDDING_DIM - vec.length).fill(0)]
}

export async function embedBundledTexts(
  texts: string | string[],
  _purpose: EmbedPurpose = "document"
): Promise<number[] | number[][]> {
  await initBundledEmbedding()
  if (!embedContext) throw new Error("Embedding 未初始化")

  const embedOne = async (text: string): Promise<number[]> => {
    const result = await embedContext!.getEmbeddingFor(text)
    return normalize([...result.vector])
  }

  if (typeof texts === "string") return embedOne(texts)
  const out: number[][] = []
  for (const t of texts) out.push(await embedOne(t))
  return out
}

export function getBundledEmbeddingStatus() {
  return {
    loaded: embedContext !== null,
    filePath: resolveBundledEmbedModelPath(),
    modelId: BUNDLED_EMBED_FILENAME,
    embeddingDim: EMBEDDING_DIM,
    provider: "node-llama-cpp" as const,
  }
}
