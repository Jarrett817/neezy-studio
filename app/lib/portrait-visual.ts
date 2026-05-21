import type { PortraitDimension, UserPortrait } from "~/services/user-portrait"

export type PortraitTone = "cool" | "warm" | "mist" | "vivid"

export type PortraitVisualProfile = {
  tone: PortraitTone
  /** 主色 HSL */
  hue: number
  saturation: number
  lightness: number
  /** 呼吸周期（秒） */
  breathPeriod: number
  breathDepth: number
  /** 内核相对尺度 0.35–1 */
  coreScale: number
  /** 粒子场：扩散、密度、散漫度 0–1 */
  particleSpread: number
  particleDensity: number
  particleChaos: number
  /** 成熟度 0–1，影响枝蔓与整体尺寸 */
  maturity: number
  /** 情绪活力 0–1 → 脉动加速 */
  vitality: number
  /** 外向 vs 内敛 0–1 */
  expressiveness: number
  stage: "seed" | "sprout" | "bloom"
}

function dim(portrait: UserPortrait, id: string) {
  return portrait.dimensions.find((d) => d.id === id)?.score ?? 0
}

function avgScore(dims: PortraitDimension[]) {
  if (dims.length === 0) return 0
  return dims.reduce((s, d) => s + d.score, 0) / dims.length
}

export function buildPortraitVisual(
  portrait: UserPortrait
): PortraitVisualProfile {
  const emotion = dim(portrait, "emotion")
  const precision = dim(portrait, "precision")
  const curiosity = dim(portrait, "curiosity")
  const collaboration = dim(portrait, "collaboration")
  const goal = dim(portrait, "goal")
  const expression = dim(portrait, "expression")
  const mean = avgScore(portrait.dimensions)
  const turns = portrait.conversationTurns

  const vitality = Math.min(
    1,
    (emotion * 0.55 + curiosity * 0.25 + expression * 0.2) / 100
  )
  const expressiveness = Math.min(
    1,
    (emotion * 0.4 + collaboration * 0.35 + curiosity * 0.25) / 100
  )

  let tone: PortraitTone = "mist"
  if (precision >= emotion && precision >= 35) tone = "cool"
  else if (emotion >= 40 || expression >= 35) tone = "warm"
  else if (vitality >= 0.55) tone = "vivid"
  else if (mean < 25) tone = "mist"

  const toneHue: Record<PortraitTone, number> = {
    cool: 215,
    warm: 32,
    mist: 260,
    vivid: 12,
  }
  const toneSat: Record<PortraitTone, number> = {
    cool: 42,
    warm: 68,
    mist: 28,
    vivid: 78,
  }
  const toneLight: Record<PortraitTone, number> = {
    cool: 58,
    warm: 62,
    mist: 72,
    vivid: 55,
  }

  const maturity = Math.min(1, turns / 48 + mean / 200)
  const coreScale = 0.38 + maturity * 0.52 + vitality * 0.12

  const breathPeriod = 5.8 - vitality * 1.8 - (expressiveness > 0.6 ? 0.4 : 0)
  const breathDepth = 0.06 + vitality * 0.05 + (tone === "warm" ? 0.03 : 0)

  const stage: PortraitVisualProfile["stage"] =
    turns < 4 ? "seed" : turns < 18 ? "sprout" : "bloom"

  return {
    tone,
    hue: toneHue[tone] + (goal > 50 ? -8 : 0),
    saturation: toneSat[tone],
    lightness: toneLight[tone],
    breathPeriod: Math.max(3.8, breathPeriod),
    breathDepth,
    coreScale: Math.min(1, coreScale),
    particleSpread: 0.25 + expressiveness * 0.65,
    particleDensity: 0.35 + (precision / 100) * 0.5,
    particleChaos:
      0.2 + (curiosity / 100) * 0.55 + (1 - precision / 100) * 0.15,
    maturity,
    vitality,
    expressiveness,
    stage,
  }
}

export function hsl(profile: PortraitVisualProfile, a = 1, lOffset = 0) {
  return `hsla(${profile.hue} ${profile.saturation}% ${profile.lightness + lOffset}% / ${a})`
}

export function branchVisible(score: number, hovered: boolean) {
  if (hovered) return true
  return score >= 28
}

export function branchOpacity(score: number, hovered: boolean) {
  if (hovered) return 0.95
  if (score >= 45) return 0.88
  if (score >= 28) return 0.55
  return 0.22
}
