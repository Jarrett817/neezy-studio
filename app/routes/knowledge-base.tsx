import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"

import { SectionHeading } from "~/components/section-heading"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { getWorkspaceSnapshot } from "~/services/workspace"

export default function KnowledgeBaseRoute() {
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })

  const items = snapshot?.knowledge ?? []

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="知识库"
        title="真实素材库"
        description="当前只展示本机真实数据；未接入写入功能前不会放占位素材。"
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="搜索真实素材" />
          </div>
          <Button
            variant="outline"
            onClick={() => window.alert("知识库写入后端尚未接入。")}
          >
            新增素材
          </Button>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
          暂无真实素材。
        </p>
      ) : null}
    </div>
  )
}
