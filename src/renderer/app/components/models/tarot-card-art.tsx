import type { ComponentType, SVGProps } from "react"

import TarotBackBalanced from "~/assets/models/tarot-back-balanced.svg?react"
import TarotBackLight from "~/assets/models/tarot-back-light.svg?react"
import TarotBackPerformance from "~/assets/models/tarot-back-performance.svg?react"
import { cn } from "~/lib/utils"
import type { ModelTier } from "~/services/electron-client"

const TIER_BACK: Record<ModelTier, ComponentType<SVGProps<SVGSVGElement>>> = {
  light: TarotBackLight,
  balanced: TarotBackBalanced,
  performance: TarotBackPerformance,
}

export function TarotCardBack({
  tier,
  className,
}: {
  tier: ModelTier
  className?: string
}) {
  const Svg = TIER_BACK[tier]
  return <Svg className={cn("h-full w-full", className)} aria-hidden />
}

const TIER_FACE: Record<ModelTier, string> = {
  light: "from-emerald-50/95 via-card to-emerald-100/50",
  balanced: "from-amber-50/95 via-card to-orange-100/45",
  performance: "from-orange-50/98 via-card to-rose-100/50",
}

export function tarotFaceGradient(tier: ModelTier) {
  return TIER_FACE[tier]
}
