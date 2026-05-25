import type { GgufInsights } from "node-llama-cpp"

/** 与 node-llama-cpp CLI `interactivelyAskForModel` 打分/加载对齐的选项 */
export type NlcInsightsTuning = {
  flashAttention: boolean
  swaFullCache: boolean
  useMmap: boolean
}

export function getDefaultNlcInsightsTuning(): NlcInsightsTuning {
  return {
    flashAttention: true,
    swaFullCache: false,
    useMmap: true,
  }
}

export function getInsightsCompatibilityOptions(
  insights: GgufInsights,
  tuning: NlcInsightsTuning
) {
  const flashAttention = tuning.flashAttention && insights.flashAttentionSupported
  return {
    flashAttention,
    swaFullCache: tuning.swaFullCache,
    useMmap: tuning.useMmap,
    kvCacheKeyType: insights.dominantTensorType,
    kvCacheValueType: insights.dominantTensorType,
  }
}

export function getInsightsResolveConfigOptions(
  insights: GgufInsights,
  tuning: NlcInsightsTuning,
  targetContextSize: number,
  embeddingContext?: boolean
) {
  return {
    targetContextSize,
    embeddingContext,
    ...getInsightsCompatibilityOptions(insights, tuning),
  }
}
