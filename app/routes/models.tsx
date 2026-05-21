import { Layers, Loader2, Sparkles, Zap } from "lucide-react"

import { FadeIn } from "~/components/animation-effects"
import { ModelRecommendationBanner } from "~/components/model-oracle-panel"
import { ModelTarotDeck } from "~/components/models/model-tarot-deck"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { useLlmModels } from "~/hooks/use-llm-models"

const KIND_TABS = [
  { kind: "chat" as const, label: "对话模型", icon: Sparkles },
  { kind: "embedding" as const, label: "Embedding", icon: Layers },
]

export default function ModelsRoute() {
  const {
    kind,
    setKind,
    items,
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
    handleDelete,
    toggleModelRun,
  } = useLlmModels()

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
        <FadeIn delay={0.04} className="shrink-0">
          <ModelRecommendationBanner metrics={metrics} />
        </FadeIn>
      )}

      <FadeIn delay={0.08} className="flex min-h-0 flex-1 flex-col">
        <ModelTarotDeck
          className="h-full min-h-0 flex-1"
          kind={kind}
          items={items}
          selectedId={selectedId}
          metrics={metrics}
          recommendedId={recommendedId}
          activeFileName={activeFileName}
          loadingFileName={loadingFileName}
          onSelect={toggleSelectedId}
          onDismissSelection={dismissDeckSelection}
          onDownload={handleDownload}
          onToggleRun={toggleModelRun}
          onDelete={handleDelete}
        />
      </FadeIn>
    </div>
  )
}
