import { ClipboardPaste, FileImage, ScanSearch, Workflow } from "lucide-react"

import { SectionHeading } from "~/components/section-heading"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

type ImportTask = {
  id: string
  name: string
  source: "drag-drop" | "clipboard"
  status: "pending" | "confirmed" | "completed"
  updatedAt: string
}

const pipeline = [
  {
    title: "导入截图",
    detail: "支持拖拽图片和剪贴板粘贴。",
    icon: FileImage,
  },
  {
    title: "半自动提取",
    detail: "规则 + OCR Beta 先提结构化字段。",
    icon: ScanSearch,
  },
  {
    title: "人工确认",
    detail: "确认后再入库草稿、知识库或数据记录。",
    icon: Workflow,
  },
] as const

const importTasks: ImportTask[] = [
  {
    id: "import-1",
    name: "防晒空瓶笔记截图_0426.png",
    source: "drag-drop",
    status: "completed",
    updatedAt: "今天 10:42",
  },
  {
    id: "import-2",
    name: "评论区高频问题整理.png",
    source: "clipboard",
    status: "confirmed",
    updatedAt: "今天 09:58",
  },
  {
    id: "import-3",
    name: "竞品周报数据截图.png",
    source: "drag-drop",
    status: "pending",
    updatedAt: "昨天 22:16",
  },
]

export default function ImportRoute() {
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="截图导入"
        title="先把导入-确认-入库链路闭环"
        description="V1 保持 Beta 口径，先解决可用性：提取结果可见、可改、可确认，避免盲目自动入库。"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {pipeline.map((item) => {
          const Icon = item.icon

          return (
            <Card key={item.title}>
              <CardHeader>
                <div className="mb-2 inline-flex size-9 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4" />
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.detail}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>导入入口</CardTitle>
            <CardDescription>后续接入 Tauri 文件系统与剪贴板插件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-4 py-10 text-center">
              <p className="text-sm font-medium">拖拽截图到这里</p>
              <p className="mt-2 text-sm text-muted-foreground">
                支持 PNG / JPG，单张建议不超过 8MB。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>选择文件</Button>
              <Button variant="outline" className="gap-2">
                <ClipboardPaste className="size-4" />
                从剪贴板粘贴
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>V1 边界提醒</CardTitle>
            <CardDescription>截图导入作为 Beta，优先稳定可控。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• 默认走规则 + OCR 提取，视觉模型通道作为实验开关。</p>
            <p>• 未人工确认的结果不可直接写入正式数据表。</p>
            <p>• 保留原图路径和提取版本，便于追溯和回滚。</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近导入记录</CardTitle>
          <CardDescription>后面会替换成 SQLite 真实数据。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {importTasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 px-4 py-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{task.name}</p>
                <p className="text-xs text-muted-foreground">
                  {task.updatedAt} · {sourceLabelMap[task.source]}
                </p>
              </div>
              <Badge variant={task.status === "completed" ? "secondary" : "outline"}>
                {statusLabelMap[task.status]}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

const sourceLabelMap = {
  "drag-drop": "拖拽导入",
  clipboard: "剪贴板",
} as const

const statusLabelMap = {
  pending: "待确认",
  confirmed: "已确认",
  completed: "已入库",
} as const
