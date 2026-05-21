import { useMemo } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, Download, Loader2, Trash2 } from "lucide-react"

import { modelTone, tierBadgeVariant } from "~/components/model-oracle-panel"
import {
  TarotCardBack,
  tarotFaceGradient,
} from "~/components/models/tarot-card-art"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import type {
  ModelCatalogItem,
  ModelKind,
  RuntimeMetrics,
} from "~/services/electron-client"

function modelSwitchLabel(isActive: boolean, isLoading: boolean) {
  if (isLoading) return "加载中"
  if (isActive) return "使用中"
  return "切换"
}

function fanLayout(slot: number, slotCount: number, selected: boolean) {
  const center = (slotCount - 1) / 2
  const offset = slot - center
  const spreadStep = slotCount <= 1 ? 0 : Math.min(5.2, 38 / (slotCount - 1))
  const rotateStep = slotCount <= 1 ? 0 : Math.min(10, 66 / (slotCount - 1))

  return {
    offset,
    spreadX: offset * spreadStep,
    rotate: offset * rotateStep,
    lift: selected ? -28 : -Math.abs(offset) * 5,
    scale: selected ? 1.06 : 0.92 - Math.abs(offset) * 0.025,
    z: selected ? 50 : 20 - Math.abs(offset),
  }
}

function ModelTarotCardFace({
  item,
  kind,
  metrics,
  isRecommended,
  isActive,
  isLoading,
  onDownload,
  onSwitch,
  onDelete,
}: {
  item: ModelCatalogItem
  kind: ModelKind
  metrics?: RuntimeMetrics
  isRecommended: boolean
  isActive: boolean
  isLoading: boolean
  onDownload: () => void
  onSwitch: () => void
  onDelete: () => void
}) {
  const switchLabel = modelSwitchLabel(isActive, isLoading)
  const isDownloading = item.status === "downloading"
  const progress = item.progress ?? 0

  return (
    <div
      className={cn(
        "absolute inset-0 flex min-h-0 flex-col overflow-y-auto rounded-2xl border-2 bg-gradient-to-br p-3.5 text-left shadow-lg",
        isActive
          ? "border-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.4)]"
          : "border-primary/40",
        tarotFaceGradient(item.tier)
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-1.5">
        <h2 className="font-display text-base leading-snug font-semibold tracking-tight">
          {item.title}
        </h2>
        {isActive && (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {item.subtitle}
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant={tierBadgeVariant(item.tier)} className="text-[10px]">
          {item.tierLabel}
        </Badge>
        {isRecommended && (
          <Badge variant="secondary" className="text-[10px]">
            推荐
          </Badge>
        )}
        {item.installed && (
          <Badge variant="outline" className="text-[10px]">
            {isActive ? "当前使用" : "已下载"}
          </Badge>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {item.fit.slice(0, 3).map((fit) => (
          <Badge
            key={fit}
            variant="outline"
            className="text-[10px] font-normal"
          >
            {fit}
          </Badge>
        ))}
      </div>

      <div className="mt-auto space-y-2 pt-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">
            {modelTone(item, metrics)}
          </span>
          <span className="font-medium tabular-nums">{item.sizeLabel}</span>
        </div>
        {item.embeddingDim != null && kind === "embedding" && (
          <p className="text-[10px] text-muted-foreground">
            {item.embeddingDim} 维
          </p>
        )}
        {isDownloading && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {progress || 0}%
            </p>
          </div>
        )}
        <div className="flex gap-1.5">
          {item.installed ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 rounded-lg text-xs"
                disabled={isActive || isLoading}
                onClick={onSwitch}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    {switchLabel}
                  </>
                ) : (
                  switchLabel
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-lg"
                onClick={onDelete}
                disabled={isActive || isLoading}
                aria-label="移除模型"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 w-full gap-1 rounded-lg text-xs"
              onClick={onDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              {isDownloading ? `${progress || 0}%` : "下载"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ModelTarotCard({
  item,
  slot,
  slotCount,
  selected,
  kind,
  metrics,
  isRecommended,
  isActive,
  isLoading,
  onSelect,
  onDownload,
  onSwitch,
  onDelete,
}: {
  item: ModelCatalogItem
  slot: number
  slotCount: number
  selected: boolean
  kind: ModelKind
  metrics?: RuntimeMetrics
  isRecommended: boolean
  isActive: boolean
  isLoading: boolean
  onSelect: () => void
  onDownload: () => void
  onSwitch: () => void
  onDelete: () => void
}) {
  const { spreadX, rotate, lift, scale, z } = fanLayout(
    slot,
    slotCount,
    selected
  )
  const switchLabel = modelSwitchLabel(isActive, isLoading)

  const cardClass = selected ? "h-[17rem] w-[12.1rem]" : "h-[14rem] w-[10rem]"

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`选择模型 ${item.title}`}
      className={cn(
        "absolute bottom-[14%] left-1/2 cursor-pointer will-change-transform",
        cardClass,
        isActive && "z-[60]"
      )}
      style={{
        zIndex: z,
        transformOrigin: "50% 100%",
        transform: `translateX(calc(-50% + ${spreadX}rem)) translateY(${lift}px) rotate(${rotate}deg) scale(${scale})`,
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {isActive && (
        <>
          <div
            className="model-card-active-glow pointer-events-none absolute -inset-4 -z-10 rounded-[1.75rem] bg-amber-400/35 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -inset-1 -z-10 rounded-[1.05rem] shadow-[0_0_22px_rgba(251,191,36,0.55),0_0_40px_rgba(245,158,11,0.25)] ring-2 ring-amber-400/80"
            aria-hidden
          />
        </>
      )}
      {selected && !isActive && (
        <div
          className="pointer-events-none absolute -inset-2 -z-10 rounded-3xl bg-primary/20 blur-xl"
          aria-hidden
        />
      )}
      <div className="h-full w-full" style={{ perspective: "1200px" }}>
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateY: selected ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        >
          <div
            className={cn(
              "absolute inset-0 overflow-hidden rounded-2xl border-2 shadow-md",
              isActive
                ? "border-amber-400/85 shadow-[0_0_14px_rgba(251,191,36,0.35)]"
                : "border-border/45"
            )}
            style={{ backfaceVisibility: "hidden" }}
          >
            <TarotCardBack tier={item.tier} />
            {item.installed && (
              <div
                className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 via-black/25 to-transparent px-2.5 pt-8 pb-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                {isActive ? (
                  <p className="text-center text-[11px] font-medium text-emerald-200">
                    使用中
                  </p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 w-full rounded-lg text-xs shadow-sm"
                    disabled={isLoading}
                    onClick={onSwitch}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        加载中
                      </>
                    ) : (
                      switchLabel
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <ModelTarotCardFace
              item={item}
              kind={kind}
              metrics={metrics}
              isRecommended={isRecommended}
              isActive={isActive}
              isLoading={isLoading}
              onDownload={onDownload}
              onSwitch={onSwitch}
              onDelete={onDelete}
            />
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export function ModelTarotDeck({
  kind,
  items,
  selectedId,
  metrics,
  recommendedId,
  activeFileName,
  loadingFileName,
  onSelect,
  onDismissSelection,
  onDownload,
  onSwitch,
  onDelete,
  className,
}: {
  kind: ModelKind
  items: ModelCatalogItem[]
  selectedId: string | null
  metrics?: RuntimeMetrics
  recommendedId?: string | null
  activeFileName: string | null
  loadingFileName: string | null
  onSelect: (id: string) => void
  onDismissSelection?: () => void
  onDownload: (id: string) => void
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
  className?: string
}) {
  const deck = useMemo(() => items, [items])

  return (
    <div className={cn("h-full min-h-[min(56vh,520px)] w-full", className)}>
      <div className="relative h-full w-full overflow-x-hidden overflow-y-hidden rounded-2xl border border-border/40 bg-gradient-to-b from-amber-50/35 via-card/25 to-muted/35 dark:from-amber-950/20 dark:via-card/10">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/40 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-0">
          {selectedId != null && onDismissSelection && (
            <button
              type="button"
              className="absolute inset-0 z-[1] cursor-default"
              aria-label="收起卡牌"
              onClick={onDismissSelection}
            />
          )}
          {deck.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              —
            </div>
          ) : (
            <div className="relative z-[2] mx-auto h-full w-full max-w-6xl">
              {deck.map((item, slot) => (
                <ModelTarotCard
                  key={item.id}
                  item={item}
                  slot={slot}
                  slotCount={deck.length}
                  selected={item.id === selectedId}
                  kind={kind}
                  metrics={metrics}
                  isRecommended={item.id === recommendedId}
                  isActive={item.fileName === activeFileName}
                  isLoading={item.fileName === loadingFileName}
                  onSelect={() => onSelect(item.id)}
                  onDownload={() => onDownload(item.id)}
                  onSwitch={() => onSwitch(item.id)}
                  onDelete={() => onDelete(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
