import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { NavLink } from "react-router"
import {
  Brain,
  Box,
  MessageSquare,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react"

import { cn } from "~/lib/utils"
import { bootstrapRuntimeModels } from "~/services/model-runtime"
import { getRuntimeMetrics } from "~/services/workspace"
import { getUserPortrait } from "~/services/user-portrait"

const navItems = [
  { href: "/", label: "对话", Icon: MessageSquare },
  { href: "/portrait", label: "人格画像", Icon: UserRound },
  { href: "/knowledge-base", label: "记忆", Icon: Brain },
  { href: "/skills", label: "Skill", Icon: SlidersHorizontal },
  { href: "/models", label: "模型", Icon: Box },
  { href: "/settings", label: "设置", Icon: Settings2 },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: portrait } = useQuery({
    queryKey: ["user-portrait"],
    queryFn: getUserPortrait,
    staleTime: 30_000,
  })
  const headerTitle =
    portrait && portrait.conversationTurns > 0
      ? portrait.summary.slice(0, 20) +
        (portrait.summary.length > 20 ? "…" : "")
      : ""

  React.useEffect(() => {
    bootstrapRuntimeModels().catch((error) =>
      console.warn("[model-runtime] bootstrap failed:", error)
    )
  }, [])

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      {/* 侧边栏 — 玻璃拟态 */}
      <aside className="group z-30 w-16 shrink-0 transition-all duration-300 ease-out hover:w-56">
        <div className="glass-warm flex h-full flex-col border-r border-border/10">
          {/* 品牌 */}
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/5 px-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-4" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Neezy
            </span>
          </div>

          {/* 导航 */}
          <nav className="flex-1 space-y-1 overflow-hidden p-2">
            {navItems.map((item) => {
              const { href, label, Icon } = item
              return (
                <NavLink
                  key={href}
                  to={href}
                  end={href === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex h-11 items-center gap-3 rounded-xl px-3 transition-all duration-200",
                      "hover:bg-primary/10",
                      isActive && "bg-primary/10 text-primary"
                    )
                  }
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {label}
                  </span>
                </NavLink>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between bg-background/80 px-6 backdrop-blur-md">
          {headerTitle ? (
            <span className="max-w-md truncate font-display text-sm text-muted-foreground">
              {headerTitle}
            </span>
          ) : (
            <span className="size-2 rounded-full bg-primary/40" aria-hidden />
          )}
          <div className="flex items-center gap-3">
            <PressureBadge />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-auto px-6 pb-6">
          {children}
        </main>
      </div>
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
        {metrics?.pressure === "low"
          ? "轻松"
          : metrics?.pressure === "medium"
            ? "负载中"
            : "高负载"}
      </span>
    </div>
  )
}
