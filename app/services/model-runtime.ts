export type LocalModelOption = {
  id: string
  name: string
  sizeLabel: string
  minMemoryLabel: string
  quantization: string
  summary: string
  downloaded: boolean
}

export type ModelRuntimeState = {
  activeModelId: string | null
  allowAutoDownload: boolean
  models: LocalModelOption[]
}

const runtimeState: ModelRuntimeState = {
  activeModelId: null,
  allowAutoDownload: false,
  models: [
    {
      id: "qwen2.5-3b-q4",
      name: "Qwen2.5 3B Instruct",
      sizeLabel: "~2.1GB",
      minMemoryLabel: "建议 8GB 内存",
      quantization: "Q4_K_M",
      summary: "中文理解稳定，适合标题/正文生成的 V1 默认档。",
      downloaded: false,
    },
    {
      id: "qwen2.5-7b-q4",
      name: "Qwen2.5 7B Instruct",
      sizeLabel: "~4.7GB",
      minMemoryLabel: "建议 16GB 内存",
      quantization: "Q4_K_M",
      summary: "生成质量更好，但推理速度和资源开销更高。",
      downloaded: false,
    },
    {
      id: "gemma3-4b-q4",
      name: "Gemma 3 4B",
      sizeLabel: "~3.0GB",
      minMemoryLabel: "建议 12GB 内存",
      quantization: "Q4_K_M",
      summary: "适合轻量端侧设备，速度优先。",
      downloaded: false,
    },
  ],
}

export async function getModelRuntimeState(): Promise<ModelRuntimeState> {
  return structuredClone(runtimeState)
}

export async function downloadModel(modelId: string): Promise<ModelRuntimeState> {
  const model = runtimeState.models.find((item) => item.id === modelId)

  if (!model) {
    throw new Error("模型不存在")
  }

  await delay(900)
  model.downloaded = true

  if (!runtimeState.activeModelId) {
    runtimeState.activeModelId = modelId
  }

  return structuredClone(runtimeState)
}

export async function setActiveModel(modelId: string): Promise<ModelRuntimeState> {
  const model = runtimeState.models.find((item) => item.id === modelId)

  if (!model || !model.downloaded) {
    throw new Error("请先下载模型")
  }

  runtimeState.activeModelId = modelId
  return structuredClone(runtimeState)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
