import { useState, useEffect } from "react"
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { ensureOllamaRunning, type DownloadProgress } from "~/services/shell"

export function DownloadScreen({ onReady }: { onReady: () => void }) {
  const [progress, setProgress] = useState<DownloadProgress>({ status: "idle", progress: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setProgress({ status: "downloading", progress: 50 })
    try {
      await ensureOllamaRunning()
    } catch (e) {
      console.warn("[download] 启动 Ollama 失败:", e)
    }
    setProgress({ status: "completed", progress: 100 })
    setTimeout(onReady, 500)
  }

  const statusText = {
    idle: "检查中...",
    downloading: "正在启动 Ollama...",
    extracting: "正在解压...",
    completed: "完成！",
    error: "出错了",
  }[progress.status]

  const progressPercent = progress.progress

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 dark:from-zinc-900 dark:to-zinc-800">
      <div className="text-center space-y-6 max-w-md">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="size-8" />
          </div>
        </div>

        {/* 标题 */}
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Neezy Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">正在准备运行环境</p>
        </div>

        {/* 进度条 */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-sm">
            {progress.status === "downloading" && <Loader2 className="size-4 animate-spin" />}
            {progress.status === "extracting" && <Loader2 className="size-4 animate-spin" />}
            {progress.status === "completed" && <CheckCircle2 className="size-4 text-green-500" />}
            {progress.status === "error" && <AlertCircle className="size-4 text-red-500" />}
            <span className="text-muted-foreground">{statusText}</span>
          </div>

          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 错误信息 */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm">
            <p className="font-medium">启动失败</p>
            <p className="text-xs mt-1 opacity-80">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
