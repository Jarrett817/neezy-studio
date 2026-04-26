import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { NavLink } from "react-router"
import { Cpu, Database, FolderSync, Sparkles } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { appNavigation } from "~/lib/navigation"
import { cn } from "~/lib/utils"
import { getAccountProfile } from "~/services/workspace"
import { useAppStore } from "~/stores/app-store"

export function AppShell({ children }: { children: React.ReactNode }) {
  const activeAccountName = useAppStore((state) => state.activeAccountName)
  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
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
                <p className="text-sm text-muted-foreground">V1 真实项目底座</p>
                <h1 className="text-base font-semibold">
                  只展示真实数据和可检测能力
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill icon={Cpu} label="模型文件检测" />
                <StatusPill icon={Database} label="本地持久化" />
                <StatusPill icon={FolderSync} label="采集未配置" />
              </div>
            </div>
          </header>

          <main className="px-5 py-5 lg:px-7">{children}</main>
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
      <Icon className="size-3.5" />
      <span>{label}</span>
    </Badge>
  )
}
