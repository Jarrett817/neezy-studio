import * as React from "react"
import { NavLink, Link, useLocation } from "react-router"
import { MessagesSquare, Settings, SlidersHorizontal } from "lucide-react"
import { motion } from "framer-motion"

import { NomiFace } from "~/components/nomi-face"
import { ModelPill } from "~/components/shell/model-pill"
import { cn } from "~/lib/utils"
import { queryClient } from "~/lib/query-client"
import { getRuntimeSettings, pushRuntimeSettingsToMain } from "~/services/settings"

const mainNavItems = [
  { href: "/chat", label: "对话", Icon: MessagesSquare, end: false },
  { href: "/skills", label: "技能", Icon: SlidersHorizontal, end: false },
] as const

const pageTitles: Record<string, string> = {
  "/chat": "对话",
  "/skills": "技能",
  "/connect": "模型与连接",
  "/settings": "设置",
}

function resolveHeaderTitle(pathname: string): string {
  const base = pathname.split("?")[0]
  return pageTitles[base] ?? "Neezy"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const headerTitle = resolveHeaderTitle(pathname)

  React.useEffect(() => {
    void (async () => {
      try {
        const settings = await getRuntimeSettings()
        queryClient.setQueryData(["runtime-settings"], settings)
        await pushRuntimeSettingsToMain()
      } catch (error) {
        console.warn("[app] startup init failed:", error)
      }
    })()
  }, [])

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="z-30 flex w-16 shrink-0 flex-col items-center border-r border-border/60 bg-card shadow-sm">
          <div className="flex h-14 shrink-0 items-center justify-center">
            <Link to="/" aria-label="Neezy" title="Neezy">
              <NomiFace className="size-9" />
            </Link>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {mainNavItems.map((item) => {
              const { href, label, Icon, end } = item
              return (
                <NavLink
                  key={href}
                  to={href}
                  end={end}
                  title={label}
                  className={({ isActive }) =>
                    cn(
                      "relative flex h-14 w-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors hover:bg-muted/60",
                      isActive ? "text-primary" : "text-foreground/70"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-xl bg-primary/12"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <Icon className="relative size-5 shrink-0" />
                      <span className="relative">{label}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card px-6 shadow-sm">
            <h1 className="text-sm font-semibold tracking-tight">{headerTitle}</h1>
            <div className="flex items-center gap-2">
              <ModelPill />
              <ButtonLinkSettings />
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </>
  )
}

function ButtonLinkSettings() {
  return (
    <Link
      to="/settings"
      className="inline-flex size-9 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      aria-label="设置"
    >
      <Settings className="size-4" />
    </Link>
  )
}
