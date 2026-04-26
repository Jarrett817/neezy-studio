import { useQuery } from "@tanstack/react-query"
import { Clock3, FileText, LibraryBig, Send } from "lucide-react"

import { SectionHeading } from "~/components/section-heading"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getBuildInfo } from "~/services/tauri-client"
import { getWorkspaceSnapshot } from "~/services/workspace"

const statCards = [
  {
    key: "draftCount",
    label: "草稿总数",
    icon: FileText,
  },
  {
    key: "readyToPublishCount",
    label: "待发布",
    icon: Send,
  },
  {
    key: "knowledgeCount",
    label: "知识条目",
    icon: LibraryBig,
  },
  {
    key: "weeklyPostCount",
    label: "本周发文",
    icon: Clock3,
  },
] as const

export default function Home() {
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })

  const { data: buildInfo } = useQuery({
    queryKey: ["build-info"],
    queryFn: getBuildInfo,
  })

  if (!snapshot || !buildInfo) {
    return null
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="工作台"
        title="今天先把发文主链路跑顺"
        description="这里先展示 M1 底座最需要的运行信息、草稿节奏和知识沉淀情况。后面接入数据库后，这些卡片会切到真实数据。"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon
          const value = snapshot.summary[item.key]

          return (
            <Card key={item.key}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="text-2xl">{value}</CardTitle>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <Icon className="size-4" />
                </div>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>今日待办</CardTitle>
            <CardDescription>围绕创作、沉淀和复盘做最短路径推进。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.todos.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <Badge variant="outline">待处理</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>运行状态</CardTitle>
            <CardDescription>先把 Tauri 命令链路打通，作为后续本地能力入口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusRow label="应用名称" value={buildInfo.appName} />
            <StatusRow label="版本" value={buildInfo.appVersion} />
            <StatusRow label="目标环境" value={buildInfo.target} />
            <StatusRow label="构建模式" value={buildInfo.profile} />
            <StatusRow label="数据库阶段" value="准备接入 Tauri SQL plugin" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近草稿</CardTitle>
            <CardDescription>后面会替换成真实的草稿 repository 数据。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.drafts.map((draft) => (
              <ListRow
                key={draft.id}
                title={draft.title}
                meta={`${draft.updatedAt} · ${statusLabelMap[draft.status]}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>知识沉淀</CardTitle>
            <CardDescription>先把分类、搜索和插入创作区的链路搭好。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.knowledge.map((item) => (
              <ListRow
                key={item.id}
                title={item.title}
                meta={`${item.category} · 最近使用 ${item.lastUsedAt}`}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const statusLabelMap = {
  draft: "草稿中",
  review: "待润色",
  published: "已发布",
} as const

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function ListRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
    </div>
  )
}
