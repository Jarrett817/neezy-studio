import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { NavLink } from "react-router"
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Database,
  MessageSquare,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { cn } from "~/lib/utils"
import { getAccountProfile, getModelStatus, getRuntimeMetrics } from "~/services/workspace"
import { useAppStore } from "~/stores/app-store"

const navItems = [
  { href: "/", label: "对话", Icon: MessageSquare },
  { href: "/creator", label: "创作", Icon: MessageSquareText },
  { href: "/knowledge-base", label: "知识库", Icon: BookOpenText },
  { href: "/skills", label: "Skill", Icon: SlidersHorizontal },
  { href: "/settings", label: "设置", Icon: Settings2 },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const activeAccountName = useAppStore((state) => state.activeAccountName)
  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
  })
  const accountName = activeAccountName || profile?.accountName

  return (
    <div className="relative min-h-svh text-foreground">
      {/* 侧边栏 — 玻璃拟态 */}
      <aside className="fixed inset-y-0 left-0 z-30 w-16 group hover:w-56 transition-all duration-300 ease-out">
        <div className="glass-warm absolute inset-0 border-r border-border/10 flex flex-col">
          {/* 品牌 */}
          <div className="flex h-14 items-center gap-2.5 px-3 border-b border-border/5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-4" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
              Neezy
            </span>
          </div>

          {/* 导航 */}
          <nav className="flex-1 space-y-1 p-2 overflow-hidden">
            {navItems.map((item) => {
              const { href, label, Icon } = item
              return (
                <NavLink
                  key={href}
                  to={href}
                  end={href === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 h-11 rounded-xl px-3 transition-all duration-200",
                      "hover:bg-primary/10",
                      isActive && "bg-primary/10 text-primary"
                    )
                  }
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {label}
                  </span>
                </NavLink>
              )
            })}
          </nav>

          {/* 底部状态 */}
          <div className="p-2 border-t border-border/5 overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2">
              <Database className="size-4 shrink-0 text-emerald-500" />
              <span className="text-xs text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                本地向量记忆
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="pl-16 relative overflow-hidden">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-6 bg-background/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-muted-foreground">
              {accountName || "Neezy Studio"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SetupReminder />
            <PressureBadge />
          </div>
        </header>

        <main className="px-6 pb-6 relative z-10 h-[100dvh] flex flex-col">{children}</main>
      </div>
    </div>
  )
}

function SetupReminder() {
  const { data: modelStatus } = useQuery({
    queryKey: ["model-status"],
    queryFn: getModelStatus,
  })

  const hasLlm = modelStatus?.some(s => s.ggufExists && !s.label.toLowerCase().includes("embedding"))
  const hasEmbedding = modelStatus?.some(s => s.label.toLowerCase().includes("embedding") && s.ggufExists)

  // Only show if not fully set up
  if (hasLlm && hasEmbedding) {
    return null
  }

  const missingItems: string[] = []
  if (!hasLlm) missingItems.push("下载一个 LLM 模型（用于对话和生成）")
  if (!hasEmbedding) missingItems.push("下载一个 Embedding 模型（用于知识库和向量检索）")

  return (
    <div className="fixed top-16 right-4 z-50 w-80 shadow-lg">
      <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/50">
        <AlertCircle className="size-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">初始化提示</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <ul className="list-disc list-inside space-y-1 text-xs mt-1">
            {missingItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p className="text-xs mt-2 opacity-70">前往「设置中心」下载模型</p>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function PressureBadge() {
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    staleTime: 10000,
  })

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
        metrics?.pressure === "low"
          ? "bg-emerald-50/80 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
          : metrics?.pressure === "medium"
            ? "bg-amber-50/80 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
            : "bg-red-50/80 text-red-500 dark:bg-red-950/60 dark:text-red-400"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          metrics?.pressure === "low"
            ? "bg-emerald-500"
            : metrics?.pressure === "medium"
              ? "bg-amber-500"
              : "bg-red-500"
        )}
      />
      <span>
        {metrics?.pressure === "low" ? "轻松" : metrics?.pressure === "medium" ? "负载中" : "高负载"}
      </span>
    </div>
  )
}