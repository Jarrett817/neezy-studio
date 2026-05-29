import { Download, FlaskConical, Loader2, Sparkles, Trash2 } from "lucide-react"

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

function runLabel(isActive: boolean, isLoading: boolean) {
  if (isLoading) return "加载中"
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
  onTest,
  testingFileName,
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
  onTest?: (id: string) => void
  testingFileName?: string | null
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const selected = item.id === selectedId
        const isRecommended = item.id === recommendedId
        const ollamaRef = item.path?.trim() || item.fileName
        const isActive =
          activeFileName === ollamaRef || activeFileName === item.fileName
        const isLoading =
          loadingFileName === ollamaRef || loadingFileName === item.fileName
        const isDownloading = item.status === "downloading"
        const isTesting = item.fileName === testingFileName
        const canCancel = isDownloading && item.cancellable && onCancelDownload
        const progress = item.progress ?? 0

        return (
          <li key={item.id}>
            <Card
              size="sm"
              className={cn(
                "cursor-pointer rounded-2xl border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md",
                selected && "ring-2 ring-primary/40",
                isActive && "border-l-[3px] border-l-primary ring-2 ring-primary/30"
              )}
              onClick={() => onSelect(item.id)}
            >
              <CardHeader>
                <CardTitle className="line-clamp-2 text-base font-semibold leading-snug">
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
                    <Badge variant="outline">Ollama 已安装</Badge>
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
                      className="h-11 min-w-0 flex-1 rounded-2xl text-sm"
                      disabled={isLoading || isTesting}
                      onClick={() => onToggleRun(item.id)}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-1 size-3 animate-spin" />
                          加载中
                        </>
                      ) : (
                        runLabel(isActive, isLoading)
                      )}
                    </Button>
                    {onTest ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 shrink-0 rounded-2xl"
                        disabled={isLoading || isTesting}
                        onClick={() => onTest(item.id)}
                        aria-label="测试模型"
                      >
                        {isTesting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FlaskConical className="size-4" />
                        )}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 rounded-2xl"
                      onClick={() => onDelete(item.id)}
                      disabled={isActive || isLoading || isTesting}
                      aria-label="移除模型"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      className="h-11 flex-1 gap-1 rounded-2xl text-sm"
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
