const EMBEDDING_DIM = 768

let llamaModule = null
let embeddingContext = null
let loadedFilePath = null
let loadedModelId = null

async function getLlamaModule() {
  if (!llamaModule) {
    llamaModule = await import("node-llama-cpp")
  }
  return llamaModule
}

async function unloadEmbeddingModel() {
  if (embeddingContext) {
    await embeddingContext.dispose()
    embeddingContext = null
  }
  loadedFilePath = null
  loadedModelId = null
}

/**
 * @param {string} filePath
 * @param {string} [modelId]
 */
async function loadEmbeddingModel(filePath, modelId) {
  if (loadedFilePath === filePath && embeddingContext) {
    loadedModelId = modelId ?? loadedModelId
    return { embeddingDim: EMBEDDING_DIM, modelId: loadedModelId }
  }

  await unloadEmbeddingModel()

  const { getLlama, LlamaEmbeddingContext } = await getLlamaModule()
  const llama = await getLlama()
  const model = await llama.loadModel({ modelPath: filePath })
  embeddingContext = await new LlamaEmbeddingContext({ model })
  loadedFilePath = filePath
  loadedModelId = modelId ?? null

  return { embeddingDim: EMBEDDING_DIM, modelId: loadedModelId }
}

/**
 * @param {string | string[]} texts
 */
async function embedTexts(texts) {
  if (!embeddingContext) {
    throw new Error("Embedding 模型未加载，请先在设置中选择并加载 Embedding 模型。")
  }

  const inputs = Array.isArray(texts) ? texts : [texts]
  const vectors = []

  for (const text of inputs) {
    const embedding = await embeddingContext.getEmbeddingFor(text)
    const vector = Array.from(embedding.vector)
    if (vector.length !== EMBEDDING_DIM) {
      throw new Error(`Embedding 维度 ${vector.length} 与数据库配置 ${EMBEDDING_DIM} 不一致`)
    }
    vectors.push(vector)
  }

  return Array.isArray(texts) ? vectors : vectors[0]
}

function getEmbeddingStatus() {
  return {
    loaded: Boolean(embeddingContext),
    filePath: loadedFilePath,
    modelId: loadedModelId,
    embeddingDim: EMBEDDING_DIM,
  }
}

module.exports = {
  EMBEDDING_DIM,
  loadEmbeddingModel,
  unloadEmbeddingModel,
  embedTexts,
  getEmbeddingStatus,
}
