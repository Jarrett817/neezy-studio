import * as React from "react"
import { NavLink } from "react-router"
import { Cpu, Database, FolderSync, Sparkles } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { appNavigation } from "~/lib/navigation"
import { cn } from "~/lib/utils"
import { useAppStore } from "~/stores/app-store"

export function AppShell({ children }: { children: React.ReactNode }) {
  const activeAccountName = useAppStore((state) => state.activeAccountName)

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(246,228,220,0.65),_transparent_38%),linear-gradient(180deg,#fffdfb_0%,#f7f1ec_100%)] text-foreground">
      <div className="mx-auto grid min-h-svh max-w-[1440px] grid-cols-1 lg:grid-cols-[276px_minmax(0,1fr)]">
        <aside className="border-b border-border/60 bg-background/80 px-5 py-5 backdrop-blur lg:border-r lg:border-b-0">
          <div className="flex items-start justify-between gap-3 lg:flex-col">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm shadow-xs">
                <Sparkles className="size-4" />
                <span className="font-medium">Neezy Studio</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{activeAccountName}</p>
                <p className="max-w-[20rem] text-sm text-muted-foreground">
                  本地优先的创作工作台，先把发文提效主链路做顺。
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="lg:mt-3">
              新建草稿
            </Button>
          </div>

          <nav className="mt-6 grid gap-2">
            {appNavigation.map((item) => {
              const Icon = item.icon

              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/"}
                  className={({ isActive }) =>
                    cn(
                      "rounded-lg border border-transparent px-3 py-3 transition-colors",
                      isActive
                        ? "border-border/70 bg-card shadow-xs"
                        : "hover:border-border/60 hover:bg-background/70"
                    )
                  }
                >
                  {({ isActive }) => (
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 rounded-md p-2",
                          isActive ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  )}
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-border/60 bg-background/75 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 lg:px-8">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">V1 项目底座施工中</p>
                <h1 className="text-lg font-semibold tracking-tight">
                  把博主发文提效链路先搭扎实
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill icon={Cpu} label="模型层待接入" />
                <StatusPill icon={Database} label="数据库骨架准备中" />
                <StatusPill icon={FolderSync} label="导入链路已预留" />
              </div>
            </div>
          </header>

          <main className="px-6 py-6 lg:px-8">{children}</main>
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
