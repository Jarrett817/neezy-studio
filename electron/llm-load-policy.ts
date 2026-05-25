import type { LlamaModel } from "node-llama-cpp"

import type { ModelLayerSplit } from "./types"

export type LayerSplitMode = "cpu" | "auto"

export type LlamaLoadPolicy = {
  gpuLayers:
    | number
    | "auto"
    | { fitContext: { contextSize: number; embeddingContext?: boolean } }
  contextSize: number
  batchSize: number
  layerSplit: LayerSplitMode
}

export const CHAT_CONTEXT_LOW = 4096
/** 3B 级模型：较小上下文以缩短 prefill */
export const CHAT_CONTEXT_LIGHT = 4096
export const CHAT_CONTEXT_DEFAULT = 8192
export const CHAT_BATCH_LIGHT = 512
export const CHAT_BATCH_DEFAULT = 256

const LIGHT_MODEL_PATTERN = /0\.5b|1\.5b|1\.7b|3b/i
export const EMBEDDING_CONTEXT_SIZE = 512

export function isLightChatModel(modelPath?: string): boolean {
  if (!modelPath) return false
  const base = modelPath.replace(/^.*[/\\]/, "")
  return LIGHT_MODEL_PATTERN.test(base)
}

/** Ollama 式：低功耗全 CPU；否则按剩余显存自动切层（fitContext）。 */
export function resolveChatLoadPolicy(
  preferLowPower: boolean,
  modelPath?: string
): LlamaLoadPolicy {
  const light = isLightChatModel(modelPath)
  if (preferLowPower) {
    return {
      gpuLayers: 0,
      contextSize: CHAT_CONTEXT_LOW,
      batchSize: CHAT_BATCH_LIGHT,
      layerSplit: "cpu",
    }
  }
  const contextSize = light ? CHAT_CONTEXT_LIGHT : CHAT_CONTEXT_DEFAULT
  return {
    // 官方默认：按显存自动 offload 层数；fitContext 在指定上下文下估算
    gpuLayers: { fitContext: { contextSize } },
    contextSize,
    batchSize: light ? CHAT_BATCH_LIGHT : CHAT_BATCH_DEFAULT,
    layerSplit: "auto",
  }
}

export function resolveEmbeddingLoadPolicy(preferLowPower: boolean): Pick<
  LlamaLoadPolicy,
  "gpuLayers" | "layerSplit"
> {
  if (preferLowPower) {
    return { gpuLayers: 0, layerSplit: "cpu" }
  }
  return {
    gpuLayers: {
      fitContext: { contextSize: EMBEDDING_CONTEXT_SIZE, embeddingContext: true },
    },
    layerSplit: "auto",
  }
}

export function describeLayerSplit(model: LlamaModel): {
  gpuLayersOnGpu: number
  totalLayers: number
  layerSplit: ModelLayerSplit
} {
  const onGpu = model.gpuLayers ?? 0
  const total = model.fileInsights?.totalLayers ?? onGpu
  return {
    gpuLayersOnGpu: onGpu,
    totalLayers: total,
    layerSplit: onGpu <= 0 ? "cpu" : onGpu >= total ? "gpu" : "mixed",
  }
}

export function isInsufficientMemoryError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    /InsufficientMemoryError/i.test(msg) ||
    /ErrorOutOfDeviceMemory/i.test(msg) ||
    /failed to allocate/i.test(msg) ||
    /Failed to load model/i.test(msg)
  )
}
