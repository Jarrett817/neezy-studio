import * as React from "react"
import { NavLink, Link, useLocation } from "react-router"
import {
  BookOpen,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react"

import { CommandPalette } from "~/components/shell/command-palette"
import { ModelPill } from "~/components/shell/model-pill"
import { cn } from "~/lib/utils"
import { queryClient } from "~/lib/query-client"
import { ensureInit } from "~/services/db"
import { bootstrapRuntimeModels } from "~/services/model-runtime"
import { getRuntimeSettings, pushRuntimeSettingsToMain } from "~/services/settings"

const mainNavItems = [
  { href: "/", label: "工作台", Icon: LayoutDashboard, end: true },
  { href: "/create", label: "创作", Icon: Wand2, end: false },
  { href: "/knowledge", label: "知识", Icon: BookOpen, end: false },
  { href: "/skills", label: "Skill", Icon: SlidersHorizontal, end: false },
  { href: "/chat", label: "对话", Icon: MessagesSquare, end: false },
] as const

const pageTitles: Record<string, string> = {
  "/": "工作台",
  "/create": "创作",
  "/knowledge": "知识",
  "/skills": "Skill",
  "/chat": "对话",
  "/connect": "模型与连接",
  "/settings": "设置",
}

function resolveHeaderTitle(pathname: string, search: string): string {
  const base = pathname.split("?")[0]
  if (base === "/chat") {
    const playbook = new URLSearchParams(search).get("playbook")?.trim()
    if (playbook) return "场景对话"
  }
  if (pathname.startsWith("/create/")) return "场景任务"
  if (pathname === "/studio" || pathname.startsWith("/studio/")) return "高级工作室"
  if (pathname.startsWith("/knowledge")) return "知识"
  return pageTitles[base] ?? "Neezy"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation()
  const headerTitle = resolveHeaderTitle(pathname, search)

  React.useEffect(() => {
    void (async () => {
      try {
        await ensureInit()
        const settings = await getRuntimeSettings()
        queryClient.setQueryData(["runtime-settings"], settings)
        await pushRuntimeSettingsToMain()
        await bootstrapRuntimeModels()
      } catch (error) {
        console.warn("[app] startup init failed:", error)
      }
    })()
  }, [])

  return (
    <>
      <CommandPalette />
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="z-30 flex w-14 shrink-0 flex-col border-r border-border/60 bg-card shadow-sm">
          <div className="flex h-14 shrink-0 items-center justify-center border-b border-border/60">
            <Link
              to="/"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
              aria-label="Neezy"
              title="Neezy"
            >
              <Sparkles className="size-4" />
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
                      "relative flex h-11 items-center justify-center rounded-xl text-sm font-medium transition-colors hover:bg-muted/60",
                      isActive
                        ? "bg-primary/10 text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                        : "text-foreground/80"
                    )
                  }
                >
                  <Icon className="size-5 shrink-0" />
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card px-6 shadow-sm">
            <h1 className="text-sm font-semibold tracking-tight">{headerTitle}</h1>
            <div className="flex items-center gap-2">
              <kbd className="hidden rounded-lg border border-border/60 bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline">
                ⌘K
              </kbd>
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
