import { useQuery } from "@tanstack/react-query"
import { BarChart3, TrendingUp } from "lucide-react"

import { getWorkspaceSnapshot } from "~/services/workspace"

export default function AnalyticsRoute() {
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })

  const metrics = snapshot?.metrics ?? []

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">数据复盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">追踪内容表现，让数据驱动优化</p>
      </div>

      {/* 概览数字 */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "本周发布", value: snapshot?.summary.weeklyPostCount ?? 0, icon: TrendingUp, color: "text-amber-500" },
          { label: "待发布", value: snapshot?.summary.readyToPublishCount ?? 0, icon: BarChart3, color: "text-emerald-500" },
          { label: "草稿总数", value: snapshot?.summary.draftCount ?? 0, icon: BarChart3, color: "text-sky-500" },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-2xl bg-card/60 p-5 hover:bg-card/80 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-semibold tabular-nums">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
                </div>
                <Icon className={`size-5 ${item.color}`} />
              </div>
            </div>
          )
        })}
      </div>

      {/* 趋势区 */}
      <div className="rounded-2xl bg-card/60 p-6">
        <h2 className="text-sm font-semibold mb-4">趋势数据</h2>
        {metrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="size-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium">暂无复盘数据</p>
            <p className="mt-1 text-xs text-muted-foreground">录入内容并发布后，这里会展示趋势</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
