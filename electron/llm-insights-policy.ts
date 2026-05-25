import type { Llama } from "node-llama-cpp"

import {
  CHAT_BATCH_DEFAULT,
  CHAT_BATCH_LIGHT,
  CHAT_CONTEXT_DEFAULT,
  CHAT_CONTEXT_LIGHT,
  EMBEDDING_CONTEXT_SIZE,
  isLightChatModel,
  resolveChatLoadPolicy,
  resolveEmbeddingLoadPolicy,
  type LlamaLoadPolicy,
} from "./llm-load-policy"
import {
  getDefaultNlcInsightsTuning,
  getInsightsResolveConfigOptions,
} from "./nlc-insights-options"
import { getLlamaModule } from "./node-llama-runtime"

export type ChatRuntimeConfig = LlamaLoadPolicy & {
  flashAttention: boolean
  compatibilityScore?: number
  swaFullCache?: boolean
  useMmap?: boolean
}

export async function resolveChatRuntimeConfig(
  modelPath: string,
  preferLowPower: boolean,
  llama: Llama
): Promise<ChatRuntimeConfig> {
  const fallback = resolveChatLoadPolicy(preferLowPower, modelPath)
  const tuning = getDefaultNlcInsightsTuning()
  if (preferLowPower) {
    return { ...fallback, flashAttention: false, swaFullCache: false, useMmap: false }
  }

  const targetContext = isLightChatModel(modelPath)
    ? CHAT_CONTEXT_LIGHT
    : CHAT_CONTEXT_DEFAULT

  try {
    const { readGgufFileInfo, GgufInsights } = await getLlamaModule()
    const info = await readGgufFileInfo(modelPath, { sourceType: "filesystem" })
    const insights = await GgufInsights.from(info, llama)
    const scored = await insights.configurationResolver.resolveAndScoreConfig(
      getInsightsResolveConfigOptions(insights, tuning, targetContext)
    )
    const { gpuLayers, contextSize } = scored.resolvedValues
    const onGpu = gpuLayers > 0
    const useFlash = tuning.flashAttention && insights.flashAttentionSupported

    return {
      gpuLayers: onGpu ? gpuLayers : 0,
      contextSize: Math.min(contextSize, targetContext),
      batchSize: isLightChatModel(modelPath) ? CHAT_BATCH_LIGHT : CHAT_BATCH_DEFAULT,
      layerSplit: onGpu ? "auto" : "cpu",
      flashAttention: useFlash,
      swaFullCache: tuning.swaFullCache,
      useMmap: tuning.useMmap,
      compatibilityScore: scored.compatibilityScore,
    }
  } catch (error) {
    console.warn("[llm-insights] fallback to static policy:", error)
    return { ...fallback, flashAttention: tuning.flashAttention, useMmap: tuning.useMmap }
  }
}

export async function resolveEmbeddingRuntimeConfig(
  modelPath: string,
  preferLowPower: boolean,
  llama: Llama
): Promise<{
  gpuLayers: LlamaLoadPolicy["gpuLayers"]
  flashAttention: boolean
  useMmap?: boolean
}> {
  const fallback = resolveEmbeddingLoadPolicy(preferLowPower)
  const tuning = getDefaultNlcInsightsTuning()
  if (preferLowPower) {
    return { gpuLayers: fallback.gpuLayers, flashAttention: false, useMmap: false }
  }

  try {
    const { readGgufFileInfo, GgufInsights } = await getLlamaModule()
    const info = await readGgufFileInfo(modelPath, { sourceType: "filesystem" })
    const insights = await GgufInsights.from(info, llama)
    const scored = await insights.configurationResolver.resolveAndScoreConfig(
      getInsightsResolveConfigOptions(insights, tuning, EMBEDDING_CONTEXT_SIZE, true)
    )
    const layers = scored.resolvedValues.gpuLayers
    const useFlash = tuning.flashAttention && insights.flashAttentionSupported
    return {
      gpuLayers: layers > 0 ? layers : 0,
      flashAttention: useFlash,
      useMmap: tuning.useMmap,
    }
  } catch (error) {
    console.warn("[llm-insights] embedding fallback:", error)
    return { gpuLayers: fallback.gpuLayers, flashAttention: false }
  }
}
