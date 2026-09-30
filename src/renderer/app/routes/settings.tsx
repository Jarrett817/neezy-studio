import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HardDrive, Settings2 } from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  type AgentThinkingLevelSetting,
  getRuntimeSettings,
  pushRuntimeSettingsToMain,
  saveRuntimeSettings,
} from "~/services/settings"
import { getStoragePaths } from "~/services/electron-client"
import { AGENT_THINKING_LEVEL_OPTIONS } from "../../../shared/app-config"

const AgentPermissionsSection = lazy(() =>
  import("~/components/settings/agent-permissions-section").then((m) => ({
    default: m.AgentPermissionsSection,
  }))
)

export default function SettingsRoute() {
  return (
    <div className="space-y-8 pt-4">
      <StoragePathsSection />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">加载权限设置…</p>
        }
      >
        <AgentPermissionsSection />
      </Suspense>
      <RuntimeSection />
    </div>
  )
}

function StoragePathsSection() {
  const { data: paths, isLoading } = useQuery({
    queryKey: ["storage-paths"],
    queryFn: getStoragePaths,
  })

  if (isLoading || !paths) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">存储位置</h2>
        </div>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </section>
    )
  }

  const root = paths.dataRoot.replace(/\\/g, "/")

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <HardDrive className="size-5 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">存储位置</h2>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 text-sm shadow-sm">
        <p className="text-muted-foreground">
          会话、技能、定时任务、soul 等应用数据固定在 Electron
          用户数据目录。Agent 工具工作区可在对话页单独选择文件夹。
        </p>
        <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
          <p className="mb-2 font-medium text-foreground">应用数据目录</p>
          <p className="font-mono break-all text-muted-foreground">{root}</p>
          <ul className="mt-3 space-y-1 font-mono break-all text-muted-foreground">
            <li>{root}/pi-sessions/</li>
            <li>{root}/soul.md</li>
            <li>{root}/pi-agent/（含 AGENTS.md、skills/、MCP）</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            Pi 配置与 MCP：
            <span className="font-mono">{root}/pi-agent/</span>
          </p>
        </div>
      </div>
    </section>
  )
}

function RuntimeSection() {
  const queryClient = useQueryClient()
  const { data: runtime, isLoading } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })

  const saveMutation = useMutation({
    mutationFn: saveRuntimeSettings,
    onSuccess: async (next) => {
      queryClient.setQueryData(["runtime-settings"], next)
      await pushRuntimeSettingsToMain()
      toast.success("思考程度已保存")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败")
    },
  })

  const onThinkingChange = (value: string) => {
    if (!runtime) return
    saveMutation.mutate({
      ...runtime,
      agentThinkingLevel: value as AgentThinkingLevelSetting,
    })
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">运行时</h2>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">思考程度</p>
            <p className="text-xs text-muted-foreground">
              控制 Pi Agent 流式推理深度
              流式推理深度；「自动」按当前模型是否支持推理决定。
            </p>
          </div>
          {isLoading || !runtime ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : (
            <Select
              value={runtime.agentThinkingLevel}
              onValueChange={onThinkingChange}
              disabled={saveMutation.isPending}
            >
              <SelectTrigger className="w-full shrink-0 rounded-xl sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_THINKING_LEVEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">AI 连接</p>
            <p className="text-xs text-muted-foreground">
              Coding Plan 与 API Key 请在专用页面配置。
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0 rounded-xl">
            <Link to="/connect">前往 AI 连接</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
