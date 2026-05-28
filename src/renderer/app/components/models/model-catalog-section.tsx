import { Loader2 } from "lucide-react"

import { RecommendedModelCards } from "~/components/models/recommended-model-cards"
import type {
  ModelCatalogItem,
  ModelKind,
  RuntimeMetrics,
} from "~/services/electron-client"

type ModelCatalogSectionProps = {
  title: string
  description?: string
  kind: ModelKind
  items: ModelCatalogItem[]
  selectedId: string | null
  metrics?: RuntimeMetrics
  recommendedId?: string | null
  activeFileName: string | null
  loadingFileName: string | null
  isLoading?: boolean
  emptyText?: string
  onSelect: (id: string) => void
  onDownload: (id: string) => void
  onCancelDownload?: (id: string) => void
  onToggleRun: (id: string) => void
  onDelete: (id: string) => void
  onTest?: (id: string) => void
  testingFileName?: string | null
}

export function ModelCatalogSection({
  title,
  description,
  kind,
  items,
  selectedId,
  metrics,
  recommendedId,
  activeFileName,
  loadingFileName,
  isLoading,
  emptyText = "暂无模型",
  onSelect,
  onDownload,
  onCancelDownload,
  onToggleRun,
  onDelete,
  onTest,
  testingFileName,
}: ModelCatalogSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card py-12 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="size-4 animate-spin" />
          加载模型列表…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <RecommendedModelCards
          kind={kind}
          items={items}
          selectedId={selectedId}
          metrics={metrics}
          recommendedId={recommendedId}
          activeFileName={activeFileName}
          loadingFileName={loadingFileName}
          onSelect={onSelect}
          onDownload={onDownload}
          onCancelDownload={onCancelDownload}
          onToggleRun={onToggleRun}
          onDelete={onDelete}
          onTest={onTest}
          testingFileName={testingFileName}
        />
      )}
    </section>
  )
}
