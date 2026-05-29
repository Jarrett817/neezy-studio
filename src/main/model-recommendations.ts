import type { ModelDefinition, RuntimeMetricsBase } from "./types"

export type ModelRecommendationsResult = {
  chatTier: "light" | "balanced" | "performance"
  notes: string[]
  recommendedChatId: string | null
  recommendedReason: string
  systemSummary: string
  chatAlternatives: string[]
}

function recommendTiers(metrics: RuntimeMetricsBase) {
  const { totalMemoryGb, availableMemoryGb, pressure } = metrics
  let chatTier: "light" | "balanced" | "performance" = "light"
  const notes: string[] = []

  if (totalMemoryGb >= 20 && availableMemoryGb >= 10 && pressure === "low") {
    chatTier = "performance"
    notes.push("内存与负载充足，可使用高性能对话模型。")
  } else if (totalMemoryGb >= 16 && availableMemoryGb >= 8 && pressure !== "high") {
    chatTier = "performance"
    notes.push("内存较充足，推荐高性能对话模型。")
  } else if (totalMemoryGb >= 12 && availableMemoryGb >= 6) {
    chatTier = "balanced"
    notes.push("适合中等体量模型，兼顾质量与速度。")
  } else if (totalMemoryGb >= 8) {
    chatTier = "light"
    notes.push("内存偏紧，建议从轻量模型开始。")
  } else {
    chatTier = "light"
    notes.push("可用内存较低，请优先下载轻量模型，并关闭其他占用内存的程序。")
  }

  if (pressure === "high") {
    chatTier = chatTier === "performance" ? "balanced" : "light"
    notes.push("当前系统负载较高，已自动下调一档推荐。")
  }

  return { chatTier, notes }
}

function sortByCompatibility(models: ModelDefinition[]) {
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
  isInstalled: (m: ModelDefinition) => boolean
}): ModelRecommendationsResult {
  const { chatTier, notes } = recommendTiers(metrics)
  const chatPool = sortByCompatibility(catalog.filter((m) => m.kind === "chat"))

  const pickBest = (
    pool: ModelDefinition[],
    tier: "light" | "balanced" | "performance"
  ) => {
    const inTier = pool.filter((m) => m.tier === tier)
    const candidates = inTier.length > 0 ? inTier : pool
    return candidates.find((m) => isInstalled(m)) ?? candidates[0] ?? null
  }

  const recommendedChat = pickBest(chatPool, chatTier)

  const chatAlternatives = chatPool
    .filter((m) => m.id !== recommendedChat?.id)
    .slice(0, 4)
    .map((m) => m.id)

  const compatNote =
    recommendedChat?.compatibilityScore != null
      ? ` 对话模型与本机兼容性约 ${Math.round(recommendedChat.compatibilityScore * 100)}%。`
      : ""

  return {
    chatTier,
    notes,
    recommendedChatId: recommendedChat?.id ?? null,
    recommendedReason: notes.join(" ") + compatNote,
    systemSummary: `本机约 ${metrics.totalMemoryGb}GB 内存，可用 ${metrics.availableMemoryGb}GB，${metrics.cpuCount} 核 CPU，当前负载「${metrics.pressure === "low" ? "低" : metrics.pressure === "medium" ? "中" : "高"}」。`,
    chatAlternatives,
  }
}
