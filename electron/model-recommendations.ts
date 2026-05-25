import type { ModelDefinition, ModelKind, RuntimeMetricsBase } from "./types"

export function recommendTiers(metrics: RuntimeMetricsBase): {
  chatTier: import("./types").ModelTier
  embeddingTier: import("./types").ModelTier
  notes: string[]
} {
  const { totalMemoryGb, availableMemoryGb, pressure } = metrics

  let chatTier: import("./types").ModelTier = "light"
  let embeddingTier: import("./types").ModelTier = "light"
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

function sortByCompatibility(models: ModelDefinition[]): ModelDefinition[] {
  return [...models].sort(
    (a, b) =>
      (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0) ||
      a.sizeBytes - b.sizeBytes
  )
}

export function buildModelRecommendations({
  metrics,
  catalog,
  isInstalled,
}: {
  metrics: RuntimeMetricsBase
  catalog: ModelDefinition[]
  isInstalled: (model: ModelDefinition) => boolean
}) {
  const { chatTier, embeddingTier, notes } = recommendTiers(metrics)

  const chatPool = sortByCompatibility(catalog.filter((m) => m.kind === "chat"))
  const embPool = sortByCompatibility(catalog.filter((m) => m.kind === "embedding"))

  const pickBest = (pool: ModelDefinition[], tier: import("./types").ModelTier) => {
    const inTier = pool.filter((m) => m.tier === tier)
    const candidates = inTier.length > 0 ? inTier : pool
    return candidates.find((m) => isInstalled(m)) ?? candidates[0] ?? null
  }

  const recommendedChat = pickBest(chatPool, chatTier)
  const recommendedEmbedding = pickBest(embPool, embeddingTier)

  const chatAlternatives = chatPool
    .filter((m) => m.id !== recommendedChat?.id)
    .slice(0, 4)
    .map((m) => m.id)

  const embeddingAlternatives = embPool
    .filter((m) => m.id !== recommendedEmbedding?.id)
    .slice(0, 2)
    .map((m) => m.id)

  const compatNote =
    recommendedChat?.compatibilityScore != null
      ? ` 对话模型与本机兼容性约 ${Math.round(recommendedChat.compatibilityScore * 100)}%。`
      : ""

  return {
    chatTier,
    embeddingTier,
    recommendedChatId: recommendedChat?.id ?? null,
    recommendedEmbeddingId: recommendedEmbedding?.id ?? null,
    recommendedReason: notes.join(" ") + compatNote,
    systemSummary: `本机约 ${metrics.totalMemoryGb}GB 内存，可用 ${metrics.availableMemoryGb}GB，${metrics.cpuCount} 核 CPU，当前负载「${
      metrics.pressure === "low" ? "低" : metrics.pressure === "medium" ? "中" : "高"
    }」。`,
    chatAlternatives,
    embeddingAlternatives,
  }
}
