import { useQuery } from "@tanstack/react-query"
import { BookOpenText, Clock3, Sparkles } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart"
import { Card, CardContent } from "~/components/ui/card"
import { getWorkspaceSnapshot, listKnowledgeItems, listSkills } from "~/services/workspace"

export default function AnalyticsRoute() {
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })

  const { data: knowledgeItems = [] } = useQuery({
    queryKey: ["knowledge-items"],
    queryFn: listKnowledgeItems,
  })

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })

  // Build category distribution from knowledge items
  const categoryData = knowledgeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1
    return acc
  }, {})

  const chartData = Object.entries(categoryData).map(([category, count]) => ({
    category,
    count,
  }))

  const recentKnowledge = [...knowledgeItems]
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">数据复盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">追踪内容表现，让数据驱动优化</p>
      </div>

      {/* 概览数字 */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "知识条目", value: knowledgeItems.length, icon: BookOpenText, color: "text-amber-500" },
          { label: "技能包", value: skills.length, icon: Sparkles, color: "text-emerald-500" },
          { label: "本周新增", value: snapshot?.summary.knowledgeCount ?? 0, icon: Clock3, color: "text-sky-500" },
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

      {/* 知识分类分布 */}
      {chartData.length > 0 && (
        <Card className="bg-card/60">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold mb-4">知识库分布</h2>
            <ChartContainer
              config={{
                count: { label: "条目数" },
              }}
              className="h-48 w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={<ChartTooltipContent hideIndicator />}
                    formatter={(value) => [value, "条目"]}
                  />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* 最近知识 */}
      <div className="rounded-2xl bg-card/60 p-6">
        <h2 className="text-sm font-semibold mb-4">最近添加</h2>
        {recentKnowledge.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpenText className="size-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">暂无知识条目</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentKnowledge.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpenText className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                </div>
                {item.updatedAt && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}