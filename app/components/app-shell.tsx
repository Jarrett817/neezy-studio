import * as React from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { NavLink } from "react-router"
import { useEffect } from "react"
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Database,
  Loader2,
  MessageSquare,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { cn } from "~/lib/utils"
import { getAccountProfile, listOllamaModels, getRuntimeMetrics, isOllamaRunning, ensureOllamaRunning } from "~/services/workspace"
import { useAppStore } from "~/stores/app-store"

const navItems = [
  { href: "/", label: "对话", Icon: MessageSquare },
  { href: "/knowledge-base", label: "记忆", Icon: Brain },
  { href: "/skills", label: "Skill", Icon: SlidersHorizontal },
  { href: "/settings", label: "设置", Icon: Settings2 },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  console.log("[AppShell] 渲染中...")
  const queryClient = useQueryClient()
  const activeAccountName = useAppStore((state) => state.activeAccountName)
  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
  })
  const accountName = activeAccountName || profile?.accountName

  // 自动启动 Ollama
  console.log("[AppShell] 检查 Ollama 状态...")
  const { data: ollamaRunning } = useQuery({
    queryKey: ["ollama-running"],
    queryFn: isOllamaRunning,
    staleTime: 10000,
  })
  console.log("[AppShell] ollamaRunning:", ollamaRunning)

  const startOllamaMutation = useMutation({
    mutationFn: ensureOllamaRunning,
    onSuccess: () => {
      console.log("[AppShell] Ollama 启动成功")
      queryClient.invalidateQueries({ queryKey: ["ollama-running"] })
    },
    onError: (err) => {
      console.error("[AppShell] Ollama 启动失败:", err)
    },
  })
  console.log("[AppShell] isPending:", startOllamaMutation.isPending)

  useEffect(() => {
    console.log("[AppShell] useEffect triggered, ollamaRunning:", ollamaRunning, "isPending:", startOllamaMutation.isPending)
    if (ollamaRunning === false && !startOllamaMutation.isPending) {
      console.log("[AppShell] 开始启动 Ollama...")
      startOllamaMutation.mutate()
    }
  }, [ollamaRunning])

  return (
    <div className="flex h-screen text-foreground overflow-hidden">
      {/* 侧边栏 — 玻璃拟态 */}
      <aside className="shrink-0 w-16 group hover:w-56 transition-all duration-300 ease-out z-30">
        <div className="glass-warm h-full border-r border-border/10 flex flex-col">
          {/* 品牌 */}
          <div className="flex h-14 items-center gap-2.5 px-3 border-b border-border/5 shrink-0">
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
          <div className="p-2 border-t border-border/5 overflow-hidden shrink-0">
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-6 bg-background/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-muted-foreground">
              {accountName || "Neezy Studio"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <OllamaStatusBanner ollamaRunning={ollamaRunning} isStarting={startOllamaMutation.isPending} />
            <SetupReminder />
            <PressureBadge />
          </div>
        </header>

        <main className="px-6 pb-6 flex flex-col min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

function SetupReminder() {
  const { data: models } = useQuery({
    queryKey: ["ollama-models"],
    queryFn: listOllamaModels,
  })

  const hasLlm = models?.some(m => !m.name.toLowerCase().includes("embed"))
  const hasEmbedding = models?.some(m => m.name.toLowerCase().includes("embed"))

  // Only show if not fully set up
  if (hasLlm && hasEmbedding) {
    return null
  }

  const missingItems: string[] = []
  if (!hasLlm) missingItems.push("下载一个 LLM 模型（用于对话和生成）")
  if (!hasEmbedding) missingItems.push("下载一个 Embedding 模型（用于记忆存储和检索）")

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

function OllamaStatusBanner({ ollamaRunning, isStarting }: { ollamaRunning: boolean | undefined, isStarting: boolean }) {
  if (ollamaRunning === true) return null

  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 animate-pulse">
      <Loader2 className={isStarting ? "size-3.5 animate-spin" : "size-3.5"} />
      <span>{isStarting ? "Ollama 启动中..." : "检查 Ollama 状态..."}</span>
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