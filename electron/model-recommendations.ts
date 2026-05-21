import { getModelsByKind } from "./model-catalog"
import type { ModelDefinition, ModelKind, ModelTier, RuntimeMetricsBase } from "./types"

export function recommendTiers(metrics: RuntimeMetricsBase): {
  chatTier: ModelTier
  embeddingTier: ModelTier
  notes: string[]
} {
  const { totalMemoryGb, availableMemoryGb, pressure } = metrics

  let chatTier: ModelTier = "light"
  let embeddingTier: ModelTier = "light"
  const notes: string[] = []

  if (totalMemoryGb >= 20 && availableMemoryGb >= 10 && pressure === "low") {
    chatTier = "performance"
    embeddingTier = "performance"
    notes.push("内存与负载充足，可使用高性能对话与 Embedding 模型。")
  } else if (totalMemoryGb >= 16 && availableMemoryGb >= 8 && pressure !== "high") {
    chatTier = "performance"
    embeddingTier = "balanced"
    notes.push("内存较充足，推荐高性能对话模型；Embedding 用中等档即可。")
  } else if (totalMemoryGb >= 12 && availableMemoryGb >= 6) {
    chatTier = "balanced"
    embeddingTier = "balanced"
    notes.push("适合中等体量模型，兼顾质量与速度。")
  } else if (totalMemoryGb >= 8) {
    chatTier = "light"
    embeddingTier = "light"
    notes.push("内存偏紧，建议从轻量模型开始。")
  } else {
    chatTier = "light"
    embeddingTier = "light"
    notes.push("可用内存较低，请优先下载轻量模型，并关闭其他占用内存的程序。")
  }

  if (pressure === "high") {
    chatTier = chatTier === "performance" ? "balanced" : "light"
    notes.push("当前系统负载较高，已自动下调一档推荐。")
  }

  return { chatTier, embeddingTier, notes }
}

export function buildModelRecommendations({
  metrics,
  isInstalled,
}: {
  metrics: RuntimeMetricsBase
  isInstalled: (model: ModelDefinition) => boolean
}) {
  const { chatTier, embeddingTier, notes } = recommendTiers(metrics)

  const pickInTier = (kind: ModelKind, tier: ModelTier) => {
    const candidates = getModelsByKind(kind).filter((m) => m.tier === tier)
    const installed = candidates.find((m) => isInstalled(m))
    return installed ?? candidates[0] ?? null
  }

  const recommendedChat = pickInTier("chat", chatTier)
  const recommendedEmbedding = pickInTier("embedding", embeddingTier)

  const chatAlternatives = getModelsByKind("chat")
    .filter((m) => m.tier === chatTier && m.id !== recommendedChat?.id)
    .slice(0, 4)

  const embeddingAlternatives = getModelsByKind("embedding")
    .filter((m) => m.tier === embeddingTier && m.id !== recommendedEmbedding?.id)
    .slice(0, 2)

  return {
    chatTier,
    embeddingTier,
    recommendedChatId: recommendedChat?.id ?? null,
    recommendedEmbeddingId: recommendedEmbedding?.id ?? null,
    recommendedReason: notes.join(" "),
    systemSummary: `本机约 ${metrics.totalMemoryGb}GB 内存，可用 ${metrics.availableMemoryGb}GB，${metrics.cpuCount} 核 CPU，当前负载「${
      metrics.pressure === "low" ? "低" : metrics.pressure === "medium" ? "中" : "高"
    }」。`,
    chatAlternatives: chatAlternatives.map((m) => m.id),
    embeddingAlternatives: embeddingAlternatives.map((m) => m.id),
  }
}
