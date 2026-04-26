import { useQuery } from "@tanstack/react-query"

import { SectionHeading } from "~/components/section-heading"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getWorkspaceSnapshot } from "~/services/workspace"

export default function AnalyticsRoute() {
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })

  if (!snapshot) {
    return null
  }

  const peakViews = Math.max(...snapshot.metrics.map((item) => item.views))
  const peakSaves = Math.max(...snapshot.metrics.map((item) => item.saves))

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="数据复盘"
        title="先保住对发文节奏有用的数据视角"
        description="V1 不做花哨大盘，只保留能直接影响选题、结构和发布时间的复盘信息。"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>周内阅读趋势</CardTitle>
            <CardDescription>先用轻量可读的条形视图代替完整图表组件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.metrics.map((item) => (
              <MetricBar
                key={item.label}
                label={item.label}
                value={item.views}
                max={peakViews}
                tone="rose"
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>周内收藏趋势</CardTitle>
            <CardDescription>后面接 `shadcn/ui chart` 时，这里可以平滑替换。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.metrics.map((item) => (
              <MetricBar
                key={item.label}
                label={item.label}
                value={item.saves}
                max={peakSaves}
                tone="amber"
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>当前复盘重点</CardTitle>
          <CardDescription>先把复盘结果压成可以直接指导发文的结论。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">标题里加入人群限定词更稳</Badge>
          <Badge variant="outline">收藏高峰集中在通勤实用选题</Badge>
          <Badge variant="outline">周四内容表现最好</Badge>
          <Badge variant="outline">先补 4 月末数据再做月度结论</Badge>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricBar({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: "rose" | "amber"
}) {
  const width = `${Math.max(10, Math.round((value / max) * 100))}%`
  const barClassName =
    tone === "rose" ? "bg-rose-300/80" : "bg-amber-300/80"

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className={`h-2 rounded-full ${barClassName}`} style={{ width }} />
      </div>
    </div>
  )
}
