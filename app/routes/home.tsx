import { useQuery } from "@tanstack/react-query"
import {
  BookOpenText,
  Clock3,
  FileText,
  Lightbulb,
  MessageSquare,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { getBuildInfo } from "~/services/electron-client"
import { getWorkspaceSnapshot } from "~/services/workspace"

const statCards = [
  { key: "draftCount", label: "草稿", icon: FileText, color: "amber" },
  { key: "readyToPublishCount", label: "待发布", icon: Send, color: "emerald" },
  { key: "knowledgeCount", label: "知识", icon: BookOpenText, color: "sky" },
  { key: "weeklyPostCount", label: "本周发文", icon: Clock3, color: "violet" },
] as const

const quickActions = [
  { label: "开始创作", href: "/creator", icon: Wand2 },
  { label: "补充知识", href: "/knowledge-base", icon: Lightbulb },
  { label: "模型对话", href: "/chat", icon: MessageSquare },
]

export default function Home() {
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })

  const { data: buildInfo } = useQuery({
    queryKey: ["build-info"],
    queryFn: getBuildInfo,
  })

  return (
    <div className="space-y-8 pt-4">
      {/* 欢迎区 — 大留白 */}
      <div className="relative py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                欢迎回来
              </span>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              准备好创作了吗？
            </h1>
            <p className="mt-2 text-muted-foreground">
              你的 AI 助手已就绪，越用越懂你。
            </p>
          </div>
          <div className="flex shrink-0 gap-2 pt-2">
            <Button asChild className="btn-warm gap-2 rounded-xl">
              <Link to="/creator">
                <Wand2 className="size-4" />
                创作
              </Link>
            </Button>
            <Button asChild variant="ghost" className="gap-2 rounded-xl">
              <Link to="/settings">设置</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* 统计卡片 — 悬浮无边框 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon
          const value = snapshot?.summary[item.key] ?? 0

          return (
            <div
              key={item.key}
              className="group relative overflow-hidden rounded-2xl bg-card/60 p-5 transition-all duration-300 hover:bg-card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-semibold tabular-nums">{value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.label}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-2.5 opacity-70 transition-opacity group-hover:opacity-100`}
                >
                  <Icon className="size-5" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              to={action.href}
              className="group flex items-center gap-3 rounded-2xl bg-card/60 px-5 py-4 transition-all duration-300 hover:bg-card"
            >
              <div className="rounded-xl bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
                <Icon className="size-4 text-primary" />
              </div>
              <span className="text-sm font-medium transition-transform group-hover:translate-x-0.5">
                {action.label}
              </span>
            </Link>
          )
        })}
      </div>

      {/* 底部状态 */}
      <div className="flex items-center justify-between pt-4">
        <span className="text-xs text-muted-foreground">
          {buildInfo?.appName ?? "Neezy Studio"} · v
          {buildInfo?.appVersion ?? "1.0"}
        </span>
        <span className="text-xs text-muted-foreground">
          本地运行 · 隐私无忧
        </span>
      </div>
    </div>
  )
}
