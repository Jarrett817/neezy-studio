import { useQuery } from "@tanstack/react-query"

import { SectionHeading } from "~/components/section-heading"
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

  const metrics = snapshot?.metrics ?? []

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="数据复盘"
        title="真实数据复盘"
        description="没有真实导入或发布数据时，复盘页保持为空。"
      />

      <Card>
        <CardHeader>
          <CardTitle>趋势数据</CardTitle>
          <CardDescription>这里不会展示占位图表。</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
              暂无真实复盘数据。
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
