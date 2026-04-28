import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { NavLink } from "react-router"
import { Activity, Cpu, Database, Sparkles } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { appNavigation } from "~/lib/navigation"
import { cn } from "~/lib/utils"
import { getAccountProfile, getRuntimeMetrics } from "~/services/workspace"
import { useAppStore } from "~/stores/app-store"

export function AppShell({ children }: { children: React.ReactNode }) {
  const activeAccountName = useAppStore((state) => state.activeAccountName)
  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })
  const accountName = activeAccountName || profile?.accountName

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto grid min-h-svh max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-background px-4 py-4 lg:border-r lg:border-b-0">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" />
              Neezy Studio
            </div>
            <p className="text-sm text-muted-foreground">
              {accountName || "未配置账号"}
            </p>
          </div>

          <nav className="mt-5 grid gap-1">
            {appNavigation.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/"}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-2 transition-colors",
                      isActive ? "bg-muted" : "hover:bg-muted/60"
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="size-4" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-7">
              <div>
                <p className="text-sm text-muted-foreground">本地优先</p>
                <h1 className="text-base font-semibold">内容 Agent 工作台</h1>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  <Activity className="size-3.5" />
                  <span>{metrics?.recommendedModelId ?? "--"}</span>
                  <span>{metrics?.pressure ?? "--"}</span>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  <Cpu className="size-3.5" />
                  <span>{metrics ? `${metrics.cpuUsagePercent.toFixed(0)}% CPU` : "--"}</span>
                  <span>
                    {metrics ? `${metrics.availableMemoryGb.toFixed(1)} GB RAM` : "--"}
                  </span>
                </div>
                <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
                  <Database className="size-3.5" />
                  本地记忆
                </Badge>
              </div>
            </div>
          </header>

          <main className="px-5 py-5 lg:px-7">{children}</main>
        </div>
      </div>
    </div>
  )
}
