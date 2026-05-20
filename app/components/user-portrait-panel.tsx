import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts"
import { Bar, BarChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart"
import { CardFloat, FadeIn } from "~/components/animation-effects"
import { PortraitGlassScene } from "~/components/r3f/portrait-glass-sphere"
import { Scene3DStage, TiltCard3D, scene3dClass } from "~/components/scene-3d"
import { cn } from "~/lib/utils"
import type { UserPortrait } from "~/services/user-portrait"

const chartConfig = {
  score: { label: "强度", color: "hsl(var(--primary))" },
} satisfies ChartConfig

export function UserPortraitPanel({ portrait }: { portrait: UserPortrait }) {
  const radarData = portrait.dimensions.map((d) => ({
    dimension: d.label,
    score: d.score,
  }))
  const hasData = portrait.conversationTurns > 0

  return (
    <Scene3DStage className="space-y-6 rounded-3xl p-1" accent="warm">
      <FadeIn>
        <TiltCard3D depth={28} className="rounded-2xl">
          <div className="rounded-2xl border border-border/50 bg-card/60 p-5 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <p className="text-sm leading-relaxed text-foreground/90">
              {portrait.summary || "多聊几轮，画像会在这里慢慢成形"}
            </p>
          </div>
        </TiltCard3D>
      </FadeIn>

      <CardFloat delay={0.05}>
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-3 backdrop-blur-sm">
          <PortraitGlassScene
            dimensions={portrait.dimensions.map((d) => ({
              label: d.label,
              score: d.score,
            }))}
            hasData={hasData}
            heightClass="h-[340px]"
          />
        </div>
      </CardFloat>

      <div className="grid gap-4 lg:grid-cols-2">
        <CardFloat delay={0.1}>
          <TiltCard3D depth={22} className="h-full rounded-2xl">
            <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
              {!hasData ? (
                <EmptyChartHint />
              ) : (
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square h-[280px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                      <Radar
                        name="score"
                        dataKey="score"
                        stroke="var(--color-score)"
                        fill="var(--color-score)"
                        fillOpacity={0.35}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </TiltCard3D>
        </CardFloat>
      </div>

      <CardFloat delay={0.15}>
        <TiltCard3D depth={18} className="rounded-2xl">
          <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            {!hasData ? (
              <EmptyChartHint />
            ) : (
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <BarChart data={radarData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="dimension"
                    width={72}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="score" fill="var(--color-score)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </TiltCard3D>
      </CardFloat>

      {portrait.topics.length > 0 && (
        <FadeIn delay={0.2}>
          <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap gap-2">
              {portrait.topics.map((topic, i) => (
                <MotionTopic
                  key={topic.label}
                  index={i}
                  weight={topic.weight}
                  label={topic.label}
                />
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      <CardFloat delay={0.25}>
        <TiltCard3D depth={16} className="rounded-2xl">
          <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            {portrait.signals.length === 0 ? (
              <p className="text-sm text-muted-foreground" />
            ) : (
              <ul className="space-y-3">
                {portrait.signals.slice(0, 10).map((signal, index) => (
                  <li
                    key={`${signal.at}-${index}`}
                    className="flex gap-3 rounded-xl border border-border/30 bg-background/30 p-2 text-sm"
                    style={{
                      transform: `translateZ(${Math.min(index * 4, 20)}px)`,
                    }}
                  >
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      {new Date(signal.at).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="flex-1 leading-relaxed">{signal.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TiltCard3D>
      </CardFloat>

      <div className={cn(scene3dClass.preserve, "grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
        {portrait.dimensions.map((dim, index) => (
          <CardFloat key={dim.id} delay={0.05 * index}>
            <TiltCard3D depth={10 + (index % 3) * 4} maxTilt={6} className="rounded-xl">
              <div className="rounded-xl border border-border/40 bg-background/50 p-3 shadow-md backdrop-blur-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{dim.label}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      dim.score >= 40 ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {dim.score}
                  </span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{dim.description}</p>
                {dim.evidence.length > 0 && (
                  <p className="mt-2 line-clamp-2 text-xs text-foreground/70">
                    「{dim.evidence[0]}」
                  </p>
                )}
              </div>
            </TiltCard3D>
          </CardFloat>
        ))}
      </div>
    </Scene3DStage>
  )
}

function MotionTopic({
  label,
  weight,
  index,
}: {
  label: string
  weight: number
  index: number
}) {
  return (
    <span
      className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary shadow-sm transition-transform hover:scale-105"
      style={{
        opacity: 0.55 + (weight / 100) * 0.45,
        transform: `translateZ(${8 + (index % 4) * 3}px)`,
      }}
    >
      {label}
      <span className="ml-1 text-muted-foreground">{weight}</span>
    </span>
  )
}

function EmptyChartHint() {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      多聊几轮后生成可视化图表
    </div>
  )
}
