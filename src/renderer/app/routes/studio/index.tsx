import { Wand2 } from "lucide-react"
import { Link } from "react-router"

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"

export default function StudioIndexRoute() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">高级工作室</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          用自然语言描述任务，由 Agent 生成场景配置；可在对话中多轮修改后保存。
        </p>
      </div>
      <Card className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Wand2 className="size-4 text-primary" />
            对话创建场景
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            左侧描述需求，右侧预览字段与 prompt，确认后保存为 JSON 场景文件。
          </p>
          <Link
            to="/studio/playbook-designer"
            className="text-sm font-medium text-primary hover:underline"
          >
            进入 →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
