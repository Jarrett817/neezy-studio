import { CheckCircle2, Download, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { Progress } from "~/components/ui/progress"
import type { ModelDownloadTask, HuggingFaceFile } from "~/services/workspace"
import { Sparkles, Zap } from "lucide-react"

interface ModelHeroCardProps {
  repoId: string
  file: HuggingFaceFile
  task?: ModelDownloadTask
  onDownload: () => void
  isDownloading: boolean
  isSelected?: boolean
  onSelect?: () => void
}

export function ModelHeroCard({ repoId, file, task, onDownload, isDownloading, isSelected, onSelect }: ModelHeroCardProps) {
  const fileName = file.path.split('/').pop() || file.path
  const isDone = task?.status === "done"
  const isRunning = task?.status === "running"

  const isQwen = repoId.toLowerCase().includes("qwen")
  const isLlama = repoId.toLowerCase().includes("llama")
  const isGemma = repoId.toLowerCase().includes("gemma")
  const isVision = fileName.toLowerCase().includes("vl")

  const accentColor = isQwen ? "from-violet-500 to-purple-600" : isLlama ? "from-amber-500 to-orange-600" : isGemma ? "from-emerald-500 to-teal-600" : "from-blue-500 to-cyan-600"
  const iconBg = isQwen ? "bg-violet-500/20 text-violet-400" : isLlama ? "bg-amber-500/20 text-amber-400" : isGemma ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"

  const hfUrl = `https://huggingface.co/${repoId}`

  return (
    <div
      className={cn(
        "group relative mx-2 overflow-hidden rounded-3xl bg-gradient-to-br from-card via-card to-card/80 border p-5 transition-all duration-300",
        isSelected ? "border-primary/50 shadow-lg shadow-primary/10" : "border-border/10 hover:border-border/30 hover:shadow-xl hover:shadow-primary/5"
      )}
    >
      <div className={cn("absolute -right-8 -top-8 size-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl", accentColor)} />
      <div className="absolute -bottom-4 -left-4 size-16 rounded-full bg-gradient-to-tr opacity-5 blur-xl" />

      <div className="relative space-y-4">
        <div className="flex items-start justify-between">
          <div className={cn("size-10 rounded-xl flex items-center justify-center", iconBg)}>
            {isVision ? <Sparkles className="size-5" /> : <Zap className="size-5" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); window.open(hfUrl, "_blank") }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-muted/50"
              title="查看 Hugging Face 详情"
            >
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </button>
            <div className={cn("size-2.5 rounded-full", isDone ? "bg-green-500" : isRunning ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/30")} />
          </div>
        </div>

        <div className="space-y-1 cursor-pointer" onClick={onSelect}>
          <h3 className="font-display text-base font-semibold leading-tight line-clamp-2">{fileName.replace('.gguf', '')}</h3>
          <p className="text-xs text-muted-foreground truncate">{repoId}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {isQwen && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500">Qwen</span>}
          {isLlama && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500">Llama</span>}
          {isGemma && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">Gemma</span>}
          {isVision && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">Vision</span>}
        </div>

        {isRunning && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{task.progress.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full bg-gradient-to-r transition-all", accentColor)}
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            onClick={(e) => { e.stopPropagation(); onDownload() }}
            disabled={isDownloading || isDone}
            className={cn(
              "w-full gap-2 rounded-xl transition-all duration-300",
              isDone ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20" : ""
            )}
          >
            {isDownloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isDone ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Download className="size-4" />
            )}
            {isDone ? "已下载" : isRunning ? "下载中" : "下载模型"}
          </Button>
        </div>
      </div>
    </div>
  )
}