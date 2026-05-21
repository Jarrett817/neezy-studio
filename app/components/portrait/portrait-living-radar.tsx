import { useEffect, useRef } from "react"
import * as echarts from "echarts/core"
import { RadarChart } from "echarts/charts"
import { TooltipComponent } from "echarts/components"
import { SVGRenderer } from "echarts/renderers"

import { hsl, type PortraitVisualProfile } from "~/lib/portrait-visual"
import type { PortraitDimension } from "~/services/user-portrait"
import { cn } from "~/lib/utils"

echarts.use([RadarChart, TooltipComponent, SVGRenderer])

export function PortraitLivingRadar({
  dimensions,
  profile,
  hasData,
  className,
}: {
  dimensions: PortraitDimension[]
  profile: PortraitVisualProfile
  hasData: boolean
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const chart = echarts.init(el, undefined, { renderer: "svg" })
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const values = dimensions.map((d) => (hasData ? d.score : 0))
    const labels = dimensions.map((d) => d.label)
    const fill = hsl(profile, 0.28)
    const stroke = hsl(profile, 0.85)
    const glow = hsl(profile, 0.15)

    chart.setOption(
      {
        animation: true,
        animationDurationUpdate: 1200,
        animationEasingUpdate: "cubicOut",
        radar: {
          center: ["50%", "52%"],
          radius: "68%",
          startAngle: 90,
          splitNumber: 4,
          shape: "circle",
          axisName: {
            color: "hsl(var(--muted-foreground))",
            fontSize: 11,
          },
          splitLine: {
            lineStyle: { color: [glow, glow, glow, glow] },
          },
          splitArea: {
            show: true,
            areaStyle: {
              color: ["transparent", glow, "transparent", glow],
            },
          },
          axisLine: { lineStyle: { color: glow } },
          indicator: labels.map((name) => ({ name, max: 100 })),
        },
        series: [
          {
            type: "radar",
            symbol: "none",
            lineStyle: {
              width: 2,
              color: stroke,
              shadowBlur: 12,
              shadowColor: stroke,
            },
            areaStyle: {
              color: new echarts.graphic.RadialGradient(0.5, 0.5, 1, [
                { offset: 0, color: fill },
                { offset: 1, color: hsl(profile, 0.05) },
              ]),
            },
            data: [{ value: values }],
            animationDurationUpdate: 1400,
            animationEasingUpdate: "cubicInOut",
          },
        ],
        tooltip: hasData
          ? {
              trigger: "item",
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
              textStyle: { color: "hsl(var(--foreground))", fontSize: 12 },
            }
          : { show: false },
      },
      { notMerge: false }
    )
  }, [dimensions, profile, hasData])

  return (
    <div
      ref={hostRef}
      className={cn("h-full min-h-[220px] w-full", className)}
      role="img"
      aria-label="人格维度活体雷达"
    />
  )
}
