import { Download, Loader2, Sparkles, Trash2 } from "lucide-react"

import { modelTone, tierBadgeVariant } from "~/components/model-oracle-panel"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import type {
  ModelCatalogItem,
  ModelKind,
  RuntimeMetrics,
} from "~/services/electron-client"

function runLabel(kind: ModelKind, isActive: boolean, isLoading: boolean) {
  if (isLoading) return "加载中"
  if (kind === "embedding") return isActive ? "取消选用" : "选用"
  return isActive ? "关闭" : "启动"
}

export function RecommendedModelCards({
  kind,
  items,
  selectedId,
  metrics,
  recommendedId,
  activeFileName,
  loadingFileName,
  onSelect,
  onDownload,
  onCancelDownload,
  onToggleRun,
  onDelete,
}: {
  kind: ModelKind
  items: ModelCatalogItem[]
  selectedId: string | null
  metrics?: RuntimeMetrics
  recommendedId?: string | null
  activeFileName: string | null
  loadingFileName: string | null
  onSelect: (id: string) => void
  onDownload: (id: string) => void
  onCancelDownload?: (id: string) => void
  onToggleRun: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const selected = item.id === selectedId
        const isRecommended = item.id === recommendedId
        const isActive = item.fileName === activeFileName
        const isLoading = item.fileName === loadingFileName
        const isDownloading = item.status === "downloading"
        const canCancel = isDownloading && item.cancellable && onCancelDownload
        const progress = item.progress ?? 0

        return (
          <li key={item.id}>
            <Card
              size="sm"
              className={cn(
                "cursor-pointer transition-shadow hover:ring-foreground/15",
                selected && "ring-2 ring-primary/50",
                isActive && "ring-2 ring-amber-400/70"
              )}
              onClick={() => onSelect(item.id)}
            >
              <CardHeader>
                <CardTitle className="line-clamp-2 text-base leading-snug">
                  {item.title}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {item.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant={tierBadgeVariant(item.tier)}>
                    {item.tierLabel}
                  </Badge>
                  {isRecommended && (
                    <Badge variant="secondary">
                      <Sparkles className="mr-0.5 size-3" />
                      系统推荐
                    </Badge>
                  )}
                  {item.installed && (
                    <Badge variant="outline">已下载</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.fit.slice(0, 4).map((fit) => (
                    <Badge
                      key={fit}
                      variant="outline"
                      className="text-xs font-normal"
                    >
                      {fit}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{modelTone(item, metrics)}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {item.sizeLabel}
                  </span>
                </div>
                {isDownloading && (
                  <div className="space-y-1">
                    <Progress value={progress} className="h-1.5" />
                    <p className="text-xs tabular-nums text-muted-foreground">
                      下载 {progress || 0}%
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter
                className="gap-2 border-t-0 bg-transparent pt-0"
                onClick={(e) => e.stopPropagation()}
              >
                {item.installed ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={isLoading}
                      onClick={() => onToggleRun(item.id)}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-1 size-3 animate-spin" />
                          加载中
                        </>
                      ) : (
                        runLabel(kind, isActive, isLoading)
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => onDelete(item.id)}
                      disabled={isActive || isLoading}
                      aria-label="移除模型"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 gap-1"
                      disabled={isDownloading && !canCancel}
                      onClick={() =>
                        canCancel
                          ? onCancelDownload(item.id)
                          : onDownload(item.id)
                      }
                    >
                      {isDownloading ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Download className="size-3" />
                      )}
                      {isDownloading
                        ? canCancel
                          ? "取消下载"
                          : "下载中"
                        : "下载"}
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
