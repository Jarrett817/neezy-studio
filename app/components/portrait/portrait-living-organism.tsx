import { useMemo, useState } from "react"

import { motion, AnimatePresence } from "framer-motion"

import { Sparkles } from "lucide-react"

import { PortraitBreathingText } from "~/components/portrait/portrait-breathing-text"

import { PortraitLivingScene } from "~/components/portrait/portrait-living-scene"

import { PortraitLivingRadar } from "~/components/portrait/portrait-living-radar"

import { PortraitMemoryVines } from "~/components/portrait/portrait-memory-vines"

import { buildPortraitVisual, hsl } from "~/lib/portrait-visual"

import { cn } from "~/lib/utils"

import type { UserPortrait } from "~/services/user-portrait"

const STAGE_LABELS = {
  seed: "萌芽",

  sprout: "生长",

  bloom: "成熟",
} as const

const SCENE_SIZE = 640

export function PortraitLivingOrganism({
  portrait,
}: {
  portrait: UserPortrait
}) {
  const [coreOpen, setCoreOpen] = useState(false)

  const [stageOverride, setStageOverride] = useState<
    "auto" | "seed" | "sprout" | "bloom"
  >("auto")

  const profile = useMemo(() => buildPortraitVisual(portrait), [portrait])

  const hasData = portrait.conversationTurns > 0

  const displayStage = stageOverride === "auto" ? profile.stage : stageOverride

  const stagePortrait = useMemo(() => {
    if (stageOverride === "auto") return portrait

    const scale =
      stageOverride === "seed" ? 0.35 : stageOverride === "sprout" ? 0.65 : 1

    return {
      ...portrait,

      dimensions: portrait.dimensions.map((d) => ({
        ...d,

        score: Math.round(d.score * scale),
      })),

      conversationTurns: Math.round(portrait.conversationTurns * scale),
    }
  }, [portrait, stageOverride])

  const stageProfile = useMemo(
    () => buildPortraitVisual(stagePortrait),

    [stagePortrait]
  )

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-border/30"
      style={{
        background: `radial-gradient(ellipse 90% 70% at 50% 38%, ${hsl(stageProfile, 0.18)}, transparent 72%), hsl(var(--card) / 0.4)`,
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(ellipse 120% 80% at 30% 15%, ${hsl(stageProfile, 0.12)}, transparent 55%)`,
        }}
        aria-hidden
      />

      <div className="relative z-10 flex flex-col gap-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />

            <span>
              {hasData
                ? `${portrait.conversationTurns} 轮对话`
                : "等待对话积累"}
            </span>

            {hasData && (
              <span
                className="rounded-full px-2 py-0.5 font-medium"
                style={{
                  background: hsl(stageProfile, 0.15),

                  color: hsl(stageProfile, 0.95, -8),
                }}
              >
                {STAGE_LABELS[displayStage]}
              </span>
            )}
          </div>

          {hasData && (
            <div className="flex gap-1 rounded-full border border-border/40 bg-background/40 p-0.5 text-[10px]">
              {(["auto", "seed", "sprout", "bloom"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStageOverride(key)}
                  className={cn(
                    "rounded-full px-2 py-1 transition-colors",

                    stageOverride === key
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {key === "auto" ? "当前" : STAGE_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        <PortraitBreathingText
          text={portrait.summary || "多聊几轮，画像会随对话慢慢成形。"}
          breathPeriod={stageProfile.breathPeriod}
          className="max-w-2xl text-foreground/90"
        />

        <div
          className="relative mx-auto w-full max-w-[min(100%,720px)]"
          style={{ minHeight: "min(58vh, 520px)" }}
          role="presentation"
        >
          <div
            className="relative mx-auto aspect-square w-full"
            style={{ maxWidth: SCENE_SIZE }}
          >
            <PortraitLivingScene
              profile={stageProfile}
              dimensions={stagePortrait.dimensions}
              hasData={hasData}
              className="absolute inset-0 h-full w-full"
            />

            <PortraitMemoryVines
              dimensions={stagePortrait.dimensions}
              profile={stageProfile}
              size={SCENE_SIZE}
            />

            {hasData && (
              <PortraitLivingRadar
                dimensions={stagePortrait.dimensions}
                profile={stageProfile}
                hasData={hasData}
                className="pointer-events-none absolute inset-[8%] opacity-35"
              />
            )}

            <button
              type="button"
              className="absolute top-1/2 left-1/2 z-20 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
              aria-label="展开记忆碎片"
              onClick={() => setCoreOpen((v) => !v)}
            />
          </div>

          {!hasData && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground">
              去对话页积累记忆
            </p>
          )}

          <motion.div
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] blur-3xl"
            style={{ background: hsl(stageProfile, 0.25) }}
            animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.92, 1.08, 0.92] }}
            transition={{
              duration: stageProfile.breathPeriod,
              repeat: Infinity,
            }}
            aria-hidden
          />
        </div>

        <AnimatePresence>
          {coreOpen && portrait.signals.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              className="mx-auto max-w-xl rounded-2xl border border-border/40 bg-card/80 p-4 shadow-lg backdrop-blur-md"
            >
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                溯源记忆碎片
              </p>

              <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                {portrait.signals.slice(0, 8).map((s, i) => (
                  <li
                    key={`${s.at}-${i}`}
                    className="rounded-lg border border-border/25 bg-background/40 px-3 py-2"
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(s.at).toLocaleString("zh-CN", {
                        month: "short",

                        day: "numeric",
                      })}
                    </span>

                    <p className="mt-0.5 leading-relaxed">{s.text}</p>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-auto grid w-full max-w-3xl gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {portrait.dimensions.map((dim) => (
            <motion.div
              key={dim.id}
              layout
              className={cn(
                "rounded-xl border px-3 py-2.5",

                dim.score >= 28
                  ? "border-border/35 bg-background/45"
                  : "border-border/15 bg-background/25 opacity-70"
              )}
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{dim.label}</span>

                <span className="text-xs text-primary tabular-nums">
                  {dim.score}
                </span>
              </div>

              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/80">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: hsl(stageProfile, 0.75) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${dim.score}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              </div>

              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {dim.description}
              </p>
            </motion.div>
          ))}
        </div>

        {portrait.topics.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {portrait.topics.map((t) => (
              <span
                key={t.label}
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={{
                  background: hsl(stageProfile, 0.12 + (t.weight / 100) * 0.12),

                  color: hsl(stageProfile, 0.9, -6),
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
