import { useEffect, useRef } from "react"
import * as echarts from "echarts/core"
import { BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import { SVGRenderer } from "echarts/renderers"

import { cn } from "~/lib/utils"

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer])

export type EchartsBarDatum = {
  category: string
  value: number
}

export function EchartsBarChart({
  data,
  valueLabel = "数量",
  className,
  height = 192,
}: {
  data: EchartsBarDatum[]
  valueLabel?: string
  className?: string
  height?: number
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

    chart.setOption({
      animation: true,
      animationDurationUpdate: 800,
      animationEasingUpdate: "cubicOut",
      grid: { left: 8, right: 12, top: 12, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: "hsl(var(--card))",
        borderColor: "hsl(var(--border))",
        textStyle: { color: "hsl(var(--foreground))", fontSize: 12 },
      },
      xAxis: {
        type: "category",
        data: data.map((d) => d.category),
        axisLine: { lineStyle: { color: "hsl(var(--border))" } },
        axisLabel: { color: "hsl(var(--muted-foreground))", fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "hsl(var(--border) / 0.5)" } },
        axisLabel: { color: "hsl(var(--muted-foreground))", fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          name: valueLabel,
          data: data.map((d) => d.value),
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "hsl(var(--primary) / 0.85)" },
              { offset: 1, color: "hsl(var(--primary) / 0.35)" },
            ]),
          },
          emphasis: {
            itemStyle: { color: "hsl(var(--primary))" },
          },
          animationDurationUpdate: 900,
        },
      ],
    })
  }, [data, valueLabel])

  return (
    <div
      ref={hostRef}
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label="柱状图"
    />
  )
}
