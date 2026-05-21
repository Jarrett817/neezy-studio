import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import type {
  ModelCatalogItem,
  ModelKind,
  RuntimeMetrics,
} from "~/services/electron-client"

export function tierBadgeVariant(tier: ModelCatalogItem["tier"]) {
  if (tier === "light") return "secondary" as const
  if (tier === "balanced") return "outline" as const
  return "default" as const
}

export function modelTone(item: ModelCatalogItem, metrics?: RuntimeMetrics) {
  if (item.installed) return "已准备好"
  if (metrics && metrics.availableMemoryGb < item.minMemoryGb) {
    return `建议至少 ${item.minMemoryGb}GB 可用内存`
  }
  return item.tierLabel
}

export function ModelRecommendationBanner({
  metrics,
}: {
  metrics: RuntimeMetrics
}) {
  return (
    <p className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-2.5 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">推荐</span>
      {" · "}
      {metrics.recommendedReason}
    </p>
  )
}

export function ModelOraclePanel({
  kind,
  item,
  metrics,
  isRecommended,
  isActive,
  isLoading,
  onDownload,
  onUse,
  onDelete,
  onPrev,
  onNext,
  useLabel,
}: {
  kind: ModelKind
  item: ModelCatalogItem | null
  metrics?: RuntimeMetrics
  isRecommended: boolean
  isActive: boolean
  isLoading: boolean
  onDownload: () => void
  onUse: () => void
  onDelete: () => void
  onPrev: () => void
  onNext: () => void
  useLabel: string
}) {
  if (!item) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-center">
        <Sparkles className="mb-2 size-8 text-primary/40" />
        <p className="text-sm text-muted-foreground">暂无该类型的模型</p>
      </div>
    )
  }

  const isDownloading = item.status === "downloading"
  const progress = item.progress ?? 0

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border/50 bg-card/60 p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={onPrev}
          aria-label="上一张卡牌"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <p className="text-center text-xs tracking-wide text-muted-foreground uppercase">
          {kind === "chat" ? "对话之牌" : "记忆之牌"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={onNext}
          aria-label="下一张卡牌"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.subtitle}
            </p>
          </div>
          {isActive && (
            <CheckCircle2 className="size-6 shrink-0 text-emerald-500" />
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant={tierBadgeVariant(item.tier)}>{item.tierLabel}</Badge>
          {isRecommended && <Badge variant="secondary">推荐</Badge>}
          {item.installed && <Badge variant="outline">已下载</Badge>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {item.fit.map((fit) => (
            <Badge key={fit} variant="outline" className="text-xs font-normal">
              {fit}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {modelTone(item, metrics)}
          </span>
          <span className="font-medium">{item.sizeLabel}</span>
        </div>

        {item.embeddingDim && (
          <p className="text-xs text-muted-foreground">
            向量维度 {item.embeddingDim}
          </p>
        )}

        {isDownloading && (
          <div className="space-y-1">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              下载中 {progress || 0}%
            </p>
          </div>
        )}

        <div className="mt-auto flex gap-2 pt-2">
          {item.installed ? (
            <>
              <Button
                type="button"
                className={cn("flex-1 rounded-xl")}
                disabled={isActive || isLoading}
                onClick={onUse}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    加载中
                  </>
                ) : isActive ? (
                  "使用中"
                ) : (
                  useLabel
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl"
                onClick={onDelete}
                disabled={isActive || isLoading}
                aria-label="移除模型"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="w-full gap-2 rounded-xl"
              onClick={onDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isDownloading ? "下载中" : "下载到本地"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
