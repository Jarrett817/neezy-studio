import { useMemo, type ReactNode } from "react"
import { Sparkles, Layers, Zap, Loader2 } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import { useLlmModels } from "~/hooks/use-llm-models"
import {
  type ModelCatalogItem,
  type ModelKind,
  type ModelTier,
  type RuntimeMetrics,
} from "~/services/electron-client"
import { ModelRecommendationBanner } from "~/components/model-oracle-panel"

const TIER_SECTIONS: { tier: ModelTier; label: string; hint: string }[] = [
  { tier: "light", label: "轻量", hint: "占用低、速度快，适合 8GB 内存" },
  { tier: "balanced", label: "中等", hint: "质量与速度均衡，适合 12GB+ 内存" },
  { tier: "performance", label: "高性能", hint: "效果更好，建议 16GB+ 内存" },
]

function tierBadgeVariant(tier: ModelTier) {
  if (tier === "light") return "secondary"
  if (tier === "balanced") return "outline"
  return "default"
}

function modelTone(item: ModelCatalogItem, metrics?: RuntimeMetrics) {
  if (item.installed) return "已准备好"
  if (metrics && metrics.availableMemoryGb < item.minMemoryGb) {
    return `建议至少 ${item.minMemoryGb}GB 可用内存`
  }
  return item.tierLabel
}

function modelRunButtonLabel(
  kind: ModelKind,
  isActive: boolean,
  isLoading: boolean
) {
  if (isLoading) return "加载中..."
  if (kind === "embedding") return isActive ? "取消" : "选用"
  return isActive ? "关闭" : "启动"
}

function ModelCard({
  item,
  kind,
  metrics,
  isRecommended,
  isActive,
  isLoading,
  onDownload,
  onCancelDownload,
  onToggleRun,
}: {
  item: ModelCatalogItem
  kind: ModelKind
  metrics?: RuntimeMetrics
  isRecommended: boolean
  isActive: boolean
  isLoading: boolean
  onDownload: () => void
  onCancelDownload?: () => void
  onToggleRun: () => void
}) {
  const isDownloading = item.status === "downloading"
  const canCancel = isDownloading && item.cancellable && onCancelDownload
  const progress = item.progress ?? 0

  return (
    <Card
      className={cn(
        "rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow",
        isActive &&
          "shadow-[0_0_22px_rgba(251,191,36,0.45),0_0_36px_rgba(245,158,11,0.2)] ring-2 ring-amber-400/85",
        isRecommended && !isActive && "ring-1 ring-primary/40"
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {item.title}
          <Badge variant={tierBadgeVariant(item.tier)}>{item.tierLabel}</Badge>
          {isRecommended && <Badge variant="secondary">推荐</Badge>}
        </CardTitle>
        <CardDescription className="line-clamp-3">
          {item.subtitle}
          {item.compatibilityScore != null && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {modelTone(item, metrics)}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {item.installed || item.compatibilityScore == null
              ? modelTone(item, metrics)
              : item.tierLabel}
          </span>
          <span className="font-medium">{item.sizeLabel}</span>
        </div>
        {isDownloading && (
          <div className="space-y-1">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              下载中 {progress || 0}%
            </p>
          </div>
        )}
        <Button
          type="button"
          className="w-full rounded-xl"
          size="sm"
          variant={canCancel ? "outline" : "default"}
          disabled={item.installed ? isLoading : isDownloading && !canCancel}
          onClick={
            canCancel
              ? onCancelDownload
              : item.installed
                ? onToggleRun
                : onDownload
          }
        >
          {item.installed
            ? modelRunButtonLabel(kind, isActive, isLoading)
            : canCancel
              ? "取消下载"
              : isDownloading
                ? "下载中"
                : "下载"}
        </Button>
      </CardContent>
    </Card>
  )
}

function ModelTierSection({
  title,
  icon,
  kind,
  items,
  metrics,
  recommendedId,
  activeFileName,
  loadingFileName,
  onDownload,
  onCancelDownload,
  onToggleRun,
}: {
  title: string
  icon: ReactNode
  kind: ModelKind
  items: ModelCatalogItem[]
  metrics?: RuntimeMetrics
  recommendedId: string | null
  activeFileName: string | null
  loadingFileName: string | null
  onDownload: (id: string) => void
  onCancelDownload?: (id: string) => void
  onToggleRun: (item: ModelCatalogItem) => void
}) {
  const byTier = useMemo(() => {
    const map = new Map<ModelTier, ModelCatalogItem[]>()
    for (const section of TIER_SECTIONS) map.set(section.tier, [])
    for (const item of items) {
      const list = map.get(item.tier) ?? []
      list.push(item)
      map.set(item.tier, list)
    }
    return map
  }, [items])

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {TIER_SECTIONS.map((section) => {
        const tierItems = byTier.get(section.tier) ?? []
        if (tierItems.length === 0) return null
        return (
          <div key={section.tier} className="space-y-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {section.label}
              </span>{" "}
              — {section.hint}
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tierItems.map((item) => (
                <ModelCard
                  key={item.id}
                  item={item}
                  kind={kind}
                  metrics={metrics}
                  isRecommended={item.id === recommendedId}
                  isActive={activeFileName === item.fileName}
                  isLoading={loadingFileName === item.fileName}
                  onDownload={() => onDownload(item.id)}
                  onCancelDownload={
                    onCancelDownload
                      ? () => onCancelDownload(item.id)
                      : undefined
                  }
                  onToggleRun={() => onToggleRun(item)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** 列表式模型浏览（主流程请用 /models） */
export function LlmModelBrowser() {
  const {
    chatItems,
    embeddingItems,
    metrics,
    currentChat,
    currentEmbedding,
    loadingState,
    isRefreshing,
    refresh,
    handleDownload,
    handleCancelDownload,
    handleStartChat,
    handleStopChat,
    handleStartEmbedding,
    handleStopEmbedding,
  } = useLlmModels()

  const chatLoadingFile = loadingState.isLoading
    ? loadingState.loadingModelId
    : null
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">本地模型（列表）</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-xl"
          onClick={refresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Zap className="size-4" />
          )}
          刷新
        </Button>
      </div>
      {metrics && <ModelRecommendationBanner metrics={metrics} />}
      <ModelTierSection
        title="对话模型"
        icon={<Sparkles className="size-5 text-primary" />}
        kind="chat"
        items={chatItems}
        metrics={metrics}
        recommendedId={metrics?.recommendedChatId ?? null}
        activeFileName={currentChat}
        loadingFileName={chatLoadingFile}
        onDownload={handleDownload}
        onCancelDownload={handleCancelDownload}
        onToggleRun={(item) => {
          void (currentChat === item.fileName
            ? handleStopChat(item)
            : handleStartChat(item))
        }}
      />
      <ModelTierSection
        title="Embedding（按需加载）"
        icon={<Layers className="size-5 text-primary" />}
        kind="embedding"
        items={embeddingItems}
        metrics={metrics}
        recommendedId={metrics?.recommendedEmbeddingId ?? null}
        activeFileName={currentEmbedding}
        loadingFileName={null}
        onDownload={handleDownload}
        onCancelDownload={handleCancelDownload}
        onToggleRun={(item) => {
          void (currentEmbedding === item.fileName
            ? handleStopEmbedding(item)
            : handleStartEmbedding(item))
        }}
      />
    </div>
  )
}
