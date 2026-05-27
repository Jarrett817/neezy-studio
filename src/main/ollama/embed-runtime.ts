import { EMBEDDING_DIM } from "../types"
import { getOllamaClient } from "./client"
import { findCatalogEntryByName, isModelInstalled } from "./catalog"
import { ensureOllama } from "./lifecycle"

let activeEmbeddingModel: string | null = null

export function getEmbeddingStatus() {
  return {
    loaded: activeEmbeddingModel !== null,
    filePath: activeEmbeddingModel,
    modelId: activeEmbeddingModel,
    embeddingDim: EMBEDDING_DIM,
  }
}

export async function loadEmbeddingModel(
  modelName: string,
  _modelId?: string,
  _options?: { preferLowPower?: boolean }
): Promise<Record<string, unknown>> {
  await ensureOllama()
  const entry = findCatalogEntryByName(modelName)
  const name = entry?.fileName ?? modelName
  if (!isModelInstalled(name)) {
    throw new Error(`Embedding 模型 ${name} 未安装，请先 pull`)
  }
  activeEmbeddingModel = name
  return {
    embeddingDim: EMBEDDING_DIM,
    modelId: name,
    layerSplit: "auto",
  }
}

export async function unloadEmbeddingModel(): Promise<void> {
  activeEmbeddingModel = null
}

export async function embedTexts(
  texts: string | string[]
): Promise<number[] | number[][]> {
  const model = activeEmbeddingModel ?? "nomic-embed-text"
  await ensureOllama()
  if (!isModelInstalled(model)) {
    throw new Error(`Embedding 模型 ${model} 未安装`)
  }

  const client = getOllamaClient()

  const embedOne = async (text: string): Promise<number[]> => {
    try {
      const data = await client.embed({ model, input: text })
      const vec = data.embeddings?.[0]
      if (vec?.length) return vec
    } catch {
      // fall through
    }
    const legacy = await client.embeddings({ model, prompt: text })
    return legacy.embedding
  }

  if (typeof texts === "string") {
    return embedOne(texts)
  }

  const out: number[][] = []
  for (const text of texts) {
    out.push(await embedOne(text))
  }
  return out
}
