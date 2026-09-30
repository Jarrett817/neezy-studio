import { motion } from "framer-motion"
import {
  CalendarClock,
  Cable,
  FileText,
  MessagesSquare,
  Settings,
  SlidersHorizontal,
} from "lucide-react"
import * as React from "react"
import { createPortal } from "react-dom"
import { Link, NavLink, useLocation } from "react-router"

import { useAgentPermissionDialog } from "~/components/chat/agent-permission-dialog"
import { NomiFace } from "~/components/nomi-face"
import { ModelPill } from "~/components/shell/model-pill"
import { queryClient } from "~/lib/query-client"
import { cn } from "~/lib/utils"
import {
  getRuntimeSettings,
  pushRuntimeSettingsToMain,
} from "~/services/settings"

const mainNavItems = [
  { href: "/chat", label: "对话", Icon: MessagesSquare, end: false },
  { href: "/tasks", label: "定时", Icon: CalendarClock, end: false },
  { href: "/skills", label: "技能", Icon: SlidersHorizontal, end: false },
  { href: "/agents-md", label: "说明", Icon: FileText, end: false },
  { href: "/mcp", label: "MCP", Icon: Cable, end: false },
] as const

const pageTitles: Record<string, string> = {
  "/tasks": "定时任务",
  "/skills": "技能",
  "/agents-md": "AGENTS.md",
  "/mcp": "MCP",
  "/connect": "模型与连接",
  "/settings": "设置",
}

function resolveHeaderTitle(pathname: string): string | null {
  const base = pathname.split("?")[0]
  if (base === "/chat" || base === "/") return null
  return pageTitles[base] ?? "Neezy"
}

const ShellHeaderActionsContext = React.createContext<HTMLElement | null>(null)

/** 将子节点挂到顶栏（模型配置左侧），用于对话页工具 */
export function ShellHeaderActions({
  children,
}: {
  children: React.ReactNode
}) {
  const el = React.useContext(ShellHeaderActionsContext)
  if (!el) return null
  return createPortal(children, el)
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const headerTitle = resolveHeaderTitle(pathname)
  const [headerActionsEl, setHeaderActionsEl] =
    React.useState<HTMLElement | null>(null)

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

  const permissionDialog = useAgentPermissionDialog()

  return (
    <ShellHeaderActionsContext.Provider value={headerActionsEl}>
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
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 35,
                          }}
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
          <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-card px-6 shadow-sm">
            {headerTitle ? (
              <h1 className="shrink-0 text-sm font-semibold tracking-tight">
                {headerTitle}
              </h1>
            ) : null}
            <div
              ref={setHeaderActionsEl}
              className="flex min-w-0 flex-1 items-center gap-1"
            />
            <div className="flex shrink-0 items-center gap-2">
              <ModelPill />
              <ButtonLinkSettings />
            </div>
          </header>

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-auto px-6",
              headerTitle ? "py-6" : "py-3"
            )}
          >
            {children}
          </main>
        </div>
      </div>
      {permissionDialog}
    </ShellHeaderActionsContext.Provider>
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
