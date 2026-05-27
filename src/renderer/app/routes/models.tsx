import { Layers, Loader2, Sparkles, Zap } from "lucide-react"

import { FadeIn } from "~/components/animation-effects"
import { ModelRecommendationBanner } from "~/components/model-oracle-panel"
import { ModelTarotDeck } from "~/components/models/model-tarot-deck"
import { RecommendedModelCards } from "~/components/models/recommended-model-cards"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { useLlmModels } from "~/hooks/use-llm-models"

const KIND_TABS = [
  { kind: "chat" as const, label: "对话模型", icon: Sparkles },
  { kind: "embedding" as const, label: "Embedding", icon: Layers },
]

const deckProps = {
  className: "h-full min-h-[min(44vh,420px)] flex-1" as const,
}

export default function ModelsRoute() {
  const {
    kind,
    setKind,
    items,
    localChatItems,
    recommendedChatItems,
    isRecommendedCatalogLoading,
    metrics,
    selectedId,
    toggleSelectedId,
    dismissDeckSelection,
    recommendedId,
    activeFileName,
    loadingFileName,
    isRefreshing,
    refresh,
    handleDownload,
    handleCancelDownload,
    handleDelete,
    toggleModelRun,
  } = useLlmModels()

  const deckCommon = {
    kind,
    selectedId,
    metrics,
    recommendedId,
    activeFileName,
    loadingFileName,
    onSelect: toggleSelectedId,
    onDismissSelection: dismissDeckSelection,
    onDownload: handleDownload,
    onCancelDownload: handleCancelDownload,
    onToggleRun: toggleModelRun,
    onDelete: handleDelete,
  }

  return (
    <div className="flex min-h-0 min-h-[calc(100dvh-8.5rem)] w-full flex-1 flex-col gap-3">
      <FadeIn className="shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-2 rounded-2xl border border-border/40 bg-card/40 p-1.5 backdrop-blur-sm">
            {KIND_TABS.map(({ kind: tabKind, label, icon: Icon }) => (
              <button
                key={tabKind}
                type="button"
                onClick={() => setKind(tabKind)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  kind === tabKind
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-xl"
            onClick={() => refresh()}
            disabled={isRefreshing}
            aria-label="刷新模型列表"
          >
            {isRefreshing ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Zap className="size-5" />
            )}
          </Button>
        </div>
      </FadeIn>

      {metrics && (
        <FadeIn delay={0.04} className="shrink-0 space-y-2">
          {metrics.gpuLabel && metrics.vramSummary && (
            <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">GPU</span>
                {`: ${metrics.gpuLabel} · `}
                <span className="font-medium text-foreground">VRAM</span>
                {` ${metrics.vramSummary}`}
              </p>
              {metrics.gpuInspectLines && metrics.gpuInspectLines.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {metrics.gpuInspectLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <ModelRecommendationBanner metrics={metrics} />
        </FadeIn>
      )}

      <FadeIn delay={0.08} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {kind === "chat" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            {localChatItems.length > 0 && (
              <section className="flex min-h-0 shrink-0 flex-col gap-2">
                <h2 className="px-1 text-sm font-medium text-foreground">
                  本机已下载
                </h2>
                <p className="px-1 text-xs text-muted-foreground">
                  已在 Ollama 中安装的模型。
                </p>
                <ModelTarotDeck
                  {...deckCommon}
                  {...deckProps}
                  items={localChatItems}
                />
              </section>
            )}
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <h2 className="px-1 text-sm font-medium text-foreground">
                推荐模型
              </h2>
              <p className="px-1 text-xs text-muted-foreground">
                通过 Ollama 拉取；列表由应用内置推荐。
              </p>
              {isRecommendedCatalogLoading ? (
                <div className="flex min-h-[min(44vh,420px)] flex-1 items-center justify-center gap-2 rounded-2xl border border-border/40 bg-card/25 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在分析推荐模型…
                </div>
              ) : recommendedChatItems.length === 0 ? (
                <div className="flex min-h-[min(44vh,420px)] flex-1 items-center justify-center rounded-2xl border border-dashed border-border/50 px-6 text-center text-sm text-muted-foreground">
                  推荐列表暂不可用。请检查网络后点击右上角刷新。
                </div>
              ) : (
                <RecommendedModelCards
                  kind={kind}
                  items={recommendedChatItems}
                  selectedId={selectedId}
                  metrics={metrics}
                  recommendedId={recommendedId}
                  activeFileName={activeFileName}
                  loadingFileName={loadingFileName}
                  onSelect={toggleSelectedId}
                  onDownload={handleDownload}
                  onCancelDownload={handleCancelDownload}
                  onToggleRun={toggleModelRun}
                  onDelete={handleDelete}
                />
              )}
            </section>
          </div>
        ) : (
          <ModelTarotDeck
            {...deckCommon}
            className="h-full min-h-0 flex-1"
            items={items}
          />
        )}
      </FadeIn>
    </div>
  )
}
