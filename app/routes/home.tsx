import { useQuery } from "@tanstack/react-query"
import { Clock3, FileText, LibraryBig, Send } from "lucide-react"

import { SectionHeading } from "~/components/section-heading"
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
  { key: "draftCount", label: "草稿总数", icon: FileText },
  { key: "readyToPublishCount", label: "待发布", icon: Send },
  { key: "knowledgeCount", label: "知识条目", icon: LibraryBig },
  { key: "weeklyPostCount", label: "本周发文", icon: Clock3 },
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
    <div className="space-y-5">
      <SectionHeading
        eyebrow="工作台"
        title="真实数据概览"
        description="这里显示本机持久化数据；没有录入就保持为空，不展示占位内容。"
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon
          const value = snapshot.summary[item.key]

          return (
            <Card key={item.key}>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 py-4">
                <div>
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="mt-1 text-2xl">{value}</CardTitle>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <Icon className="size-4" />
                </div>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>运行状态</CardTitle>
          <CardDescription>
            Tauri 命令、模型文件检测和本地持久化是当前真实底座。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <StatusRow label="应用名称" value={buildInfo.appName} />
          <StatusRow label="版本" value={buildInfo.appVersion} />
          <StatusRow label="目标环境" value={buildInfo.target} />
          <StatusRow label="构建模式" value={buildInfo.profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>近期内容</CardTitle>
          <CardDescription>
            当前没有真实草稿、知识库或复盘数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
            录入真实数据后，这里会展示对应记录。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
