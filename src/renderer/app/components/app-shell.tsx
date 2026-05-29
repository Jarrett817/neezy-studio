import * as React from "react"
import { NavLink, Link, useLocation } from "react-router"
import {
  BookOpen,
  LayoutDashboard,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
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

const NAV_COLLAPSED_KEY = "neezy:nav-collapsed"

const mainNavItems = [
  { href: "/", label: "工作台", Icon: LayoutDashboard, end: true },
  { href: "/create", label: "创作", Icon: Wand2, end: false },
  { href: "/knowledge", label: "知识", Icon: BookOpen, end: false },
  { href: "/chat", label: "对话", Icon: MessagesSquare, end: false },
] as const

const pageTitles: Record<string, string> = {
  "/": "工作台",
  "/create": "创作",
  "/knowledge": "知识",
  "/chat": "对话",
  "/connect": "模型与连接",
  "/models": "本地模型",
  "/settings": "设置",
}

function resolveHeaderTitle(pathname: string): string {
  if (pathname.startsWith("/create/")) return "场景任务"
  if (pathname === "/studio" || pathname.startsWith("/studio/")) return "高级工作室"
  if (pathname.startsWith("/knowledge")) return "知识"
  const base = pathname.split("?")[0]
  return pageTitles[base] ?? "Neezy"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const headerTitle = resolveHeaderTitle(pathname)
  const [navCollapsed, setNavCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1"
  })

  const toggleNav = React.useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0")
      return next
    })
  }, [])

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
      <aside
        className={cn(
          "z-30 flex shrink-0 flex-col border-r border-border/60 bg-card shadow-sm transition-[width] duration-200",
          navCollapsed ? "w-14" : "w-[220px]"
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border/60",
            navCollapsed ? "justify-center px-0" : "gap-2.5 px-3"
          )}
        >
          {!navCollapsed ? (
            <>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="size-4" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                Neezy
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={toggleNav}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={navCollapsed ? "展开菜单" : "收起菜单"}
            title={navCollapsed ? "展开菜单" : "收起菜单"}
          >
            {navCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav className={cn("flex-1 space-y-1 overflow-y-auto", navCollapsed ? "p-2" : "p-3")}>
          {mainNavItems.map((item) => {
            const { href, label, Icon, end } = item
            return (
              <NavLink
                key={href}
                to={href}
                end={end}
                title={navCollapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-11 items-center rounded-xl text-sm font-medium transition-colors",
                    navCollapsed ? "justify-center px-0" : "gap-3 px-3",
                    "hover:bg-muted/60",
                    isActive
                      ? cn(
                          "bg-primary/10 text-primary",
                          navCollapsed
                            ? "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                            : "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                        )
                      : "text-foreground/80"
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                {!navCollapsed ? label : null}
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
