import type { LlamaModel } from "node-llama-cpp"

import type { ModelLayerSplit } from "./types"

export type LayerSplitMode = "cpu" | "auto"

export type LlamaLoadPolicy = {
  gpuLayers:
    | number
    | "auto"
    | { fitContext: { contextSize: number; embeddingContext?: boolean } }
  contextSize: number
  layerSplit: LayerSplitMode
}

export const CHAT_CONTEXT_LOW = 4096
export const CHAT_CONTEXT_DEFAULT = 8192
export const EMBEDDING_CONTEXT_SIZE = 512

/** Ollama 式：低功耗全 CPU；否则按剩余显存自动切层（fitContext）。 */
export function resolveChatLoadPolicy(preferLowPower: boolean): LlamaLoadPolicy {
  if (preferLowPower) {
    return {
      gpuLayers: 0,
      contextSize: CHAT_CONTEXT_LOW,
      layerSplit: "cpu",
    }
  }
  return {
    gpuLayers: { fitContext: { contextSize: CHAT_CONTEXT_DEFAULT } },
    contextSize: CHAT_CONTEXT_DEFAULT,
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
