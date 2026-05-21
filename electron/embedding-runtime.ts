import type { LlamaEmbeddingContext, LlamaModel } from "node-llama-cpp"

import { describeLayerSplit, resolveEmbeddingLoadPolicy } from "./llm-load-policy"
import { acquireLlama, getLlamaModule } from "./node-llama-runtime"
import { EMBEDDING_DIM } from "./types"

export { EMBEDDING_DIM }

let embeddingContext: LlamaEmbeddingContext | null = null
let loadedFilePath: string | null = null
let loadedModelId: string | null = null

export async function unloadEmbeddingModel(): Promise<void> {
  if (embeddingContext) {
    await embeddingContext.dispose()
    embeddingContext = null
  }
  loadedFilePath = null
  loadedModelId = null
}

export async function loadEmbeddingModel(
  filePath: string,
  modelId?: string,
  options: { preferLowPower?: boolean } = {}
): Promise<Record<string, unknown>> {
  if (loadedFilePath === filePath && embeddingContext) {
    loadedModelId = modelId ?? loadedModelId
    return { embeddingDim: EMBEDDING_DIM, modelId: loadedModelId }
  }

  await unloadEmbeddingModel()

  const preferLowPower = Boolean(options.preferLowPower)
  const policy = resolveEmbeddingLoadPolicy(preferLowPower)
  const llama = await acquireLlama(preferLowPower)
  const model: LlamaModel = await llama.loadModel({
    modelPath: filePath,
    gpuLayers: policy.gpuLayers,
  })
  embeddingContext = await model.createEmbeddingContext()
  loadedFilePath = filePath
  loadedModelId = modelId ?? null

  return {
    embeddingDim: EMBEDDING_DIM,
    modelId: loadedModelId,
    ...describeLayerSplit(model),
    layerSplit: policy.layerSplit,
  }
}

export async function embedTexts(
  texts: string | string[]
): Promise<number[] | number[][]> {
  if (!embeddingContext) {
    throw new Error("Embedding 模型未加载，请先在设置中选择 Embedding 模型。")
  }

  const inputs = Array.isArray(texts) ? texts : [texts]
  const vectors: number[][] = []

  for (const text of inputs) {
    const embedding = await embeddingContext.getEmbeddingFor(text)
    const vector = Array.from(embedding.vector)
    if (vector.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding 维度 ${vector.length} 与数据库配置 ${EMBEDDING_DIM} 不一致`
      )
    }
    vectors.push(vector)
  }

  return Array.isArray(texts) ? vectors : vectors[0]
}

export function getEmbeddingStatus() {
  return {
    loaded: Boolean(embeddingContext),
    filePath: loadedFilePath,
    modelId: loadedModelId,
    embeddingDim: EMBEDDING_DIM,
  }
}
