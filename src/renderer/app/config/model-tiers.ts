import type { ModelTier } from "~/services/settings"

export const MODEL_TIERS: ModelTier[] = ["light", "balanced", "performance"]

export const MODEL_TIER_META: Record<
  ModelTier,
  { label: string; hint: string; icon: "feather" | "scale" | "zap" }
> = {
  light: { label: "轻量", hint: "省资源、响应快", icon: "feather" },
  balanced: { label: "均衡", hint: "日常对话推荐", icon: "scale" },
  performance: { label: "高性能", hint: "复杂任务与长文", icon: "zap" },
}
