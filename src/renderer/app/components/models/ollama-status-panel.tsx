import { useQuery } from "@tanstack/react-query"
import { Loader2, RefreshCw, Server } from "lucide-react"

import { Button } from "~/components/ui/button"
import { getOllamaStatus } from "~/services/electron-client"
import { findOllamaChatEntry } from "~/config/chat-models"
import { getRuntimeSettings } from "~/services/settings"
import { cn } from "~/lib/utils"

export function OllamaStatusPanel({
  onRefreshCatalog,
  isRefreshingCatalog,
}: {
  onRefreshCatalog: () => void
  isRefreshingCatalog: boolean
}) {
  const {
    data: status,
    error,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["ollama-status"],
    queryFn: getOllamaStatus,
    refetchInterval: 15_000,
    retry: 1,
  })

  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 5_000,
  })

  const connected = status?.connected === true
  const selectedOllama =
    findOllamaChatEntry(runtimeSettings?.chatModels ?? [])?.model.trim() ?? ""
  const errorMessage =
    error instanceof Error ? error.message : isError ? "无法检测 Ollama 状态" : null

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              connected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            <Server className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-medium">
              {connected ? "Ollama 已连接" : "Ollama 未连接"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {status?.host ?? "—"}
              {status?.version ? ` · v${status.version}` : null}
            </p>
            {connected && status?.runningModels.length ? (
              <p className="text-xs text-muted-foreground">
                内存中：{status.runningModels.map((m) => m.name).join("、")}
              </p>
            ) : connected && selectedOllama ? (
              <p className="text-xs text-muted-foreground">
                已选用对话模型：<span className="font-medium text-foreground">{selectedOllama}</span>
                （Ollama 按需加载，未常驻内存时此处可能为空）
              </p>
            ) : connected ? (
              <p className="text-xs text-muted-foreground">
                未选用本地对话模型，请在下方选择并启动
              </p>
            ) : errorMessage ? (
              <p className="text-xs text-destructive">
                {errorMessage.includes("No handler registered")
                  ? "主进程未加载最新 IPC，请完全退出 Neezy 后重新 bun run dev"
                  : errorMessage}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                托盘已运行但应用连不上时：到 AI 连接 确认地址为 http://127.0.0.1:11434，点刷新；或在终端执行 ollama list 自测
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={isFetching || isRefreshingCatalog}
          onClick={() => {
            void refetch()
            onRefreshCatalog()
          }}
        >
          {isFetching || isRefreshingCatalog ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          刷新
        </Button>
      </div>
    </div>
  )
}
