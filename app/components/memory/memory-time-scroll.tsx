import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion"
import { Stamp, Tag, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { MemoryScrollTexture } from "~/components/memory/memory-scroll-texture"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { MemoryItem } from "~/services/memories"

const PORTRAIT_TAGS = [
  "目标导向",
  "表达偏好",
  "探索好奇",
  "细节理性",
  "情感开放",
  "协作倾向",
] as const

function memoryFreshness(updatedAt: number, now: number) {
  const ageDays = (now - updatedAt) / (86400 * 1000)
  if (ageDays <= 3) return 1
  if (ageDays <= 14) return 0.75
  if (ageDays <= 60) return 0.45
  return 0.22
}

function isKeyMemory(item: MemoryItem, now: number) {
  const recent = now - item.updated_at < 7 * 86400 * 1000
  const substantial = item.content.length >= 180
  const titled = item.title.length >= 8
  return (recent && substantial) || (substantial && titled)
}

function formatScrollDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function MemoryScrollEntry({
  item,
  now,
  expanded,
  onToggle,
  onDelete,
  onTag,
}: {
  item: MemoryItem
  now: number
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onTag: (tag: string) => void
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const fresh = memoryFreshness(item.updated_at, now)
  const keyMem = isKeyMemory(item, now)

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const startPress = () => {
    clearPress()
    pressTimer.current = setTimeout(() => setTagMenuOpen(true), 520)
  }

  return (
    <motion.article
      layout
      className={cn(
        "relative mx-auto w-[min(100%,36rem)] cursor-pointer rounded-sm border px-5 py-4 transition-shadow",
        expanded
          ? "z-10 border-amber-700/25 bg-[#faf4e6] shadow-[inset_0_2px_12px_rgba(120,80,40,0.08),0_8px_28px_-8px_rgba(60,40,20,0.25)]"
          : "border-amber-900/10 bg-[#f8f0dc]/90 hover:shadow-md",
        keyMem && !expanded && "ring-1 ring-amber-600/35",
        `opacity-[${0.35 + fresh * 0.65}]`,
        `saturate-[${0.7 + fresh * 0.35}]`,
        `sepia-[${(1 - fresh) * 0.55}]`
      )}
      onClick={onToggle}
      onPointerDown={startPress}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      whileTap={{ scale: 0.995, y: expanded ? 0 : 1 }}
    >
      {keyMem && (
        <div
          className="pointer-events-none absolute -top-1 -right-1 flex size-11 rotate-12 items-center justify-center rounded-full border-2 border-red-700/50 bg-red-50/80 text-red-800/75 shadow-sm dark:bg-red-950/40 dark:text-red-300/80"
          aria-hidden
        >
          <Stamp className="size-5" strokeWidth={1.5} />
          <span className="absolute text-[9px] font-bold">印</span>
        </div>
      )}

      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-amber-900/10 pb-2">
        <time className="text-[11px] text-amber-900/55 tabular-nums">
          {formatScrollDate(item.updated_at)}
        </time>
        <span className="rounded bg-amber-900/8 px-2 py-0.5 text-[10px] text-amber-900/70">
          {item.category}
        </span>
      </div>

      <h3
        className={cn(
          "font-display text-base leading-snug",
          fresh > 0.7 ? "text-amber-950" : "text-amber-950/65"
        )}
      >
        {item.title}
      </h3>

      <p
        className={cn(
          "mt-2 text-sm leading-relaxed",
          fresh > 0.7 ? "text-amber-950/85" : "text-amber-950/50"
        )}
      >
        {expanded ? item.content : item.content.slice(0, 160)}
        {!expanded && item.content.length > 160 ? "…" : null}
      </p>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex justify-end gap-1 border-t border-amber-900/10 pt-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                  <AlertDialogDescription>
                    确定要删除「{item.title}」吗？
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tagMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="absolute top-10 right-2 z-30 min-w-[9rem] rounded-lg border border-border bg-popover p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              归入人格标签
            </p>
            {PORTRAIT_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => {
                  onTag(tag)
                  setTagMenuOpen(false)
                }}
              >
                <Tag className="size-3.5 opacity-70" />
                {tag}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

export function MemoryTimeScroll({
  items,
  onDelete,
  className,
}: {
  items: MemoryItem[]
  onDelete: (item: MemoryItem) => void
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const scrollY = useMotionValue(0)
  const smoothY = useSpring(scrollY, { stiffness: 120, damping: 28, mass: 0.8 })

  const now = Date.now()
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.updated_at - b.updated_at),
    [items]
  )

  const parallaxBack = useTransform(smoothY, [0, 400], [0, -24])

  const handleScroll = useCallback(() => {
    if (scrollRef.current) scrollY.set(scrollRef.current.scrollTop)
  }, [scrollY])

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [])

  useEffect(() => {
    if (sorted.length > 0) scrollToEnd()
  }, [sorted.length, scrollToEnd])

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-amber-800/20 bg-[#f5ecd8]/40 text-sm text-amber-900/50",
          className
        )}
      >
        卷轴空白，去对话中积累记忆
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-amber-800/20 shadow-inner",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <MemoryScrollTexture className="h-full w-full opacity-90 dark:opacity-70" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-[#e8dcc4] to-transparent dark:from-[#2a2418]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-[#e0d4bc] to-transparent dark:from-[#1f1a12]" />

      <div className="pointer-events-none absolute top-0 left-3 z-10 h-full w-3 bg-gradient-to-r from-amber-900/15 to-transparent" />
      <div className="pointer-events-none absolute top-0 right-3 z-10 h-full w-3 bg-gradient-to-l from-amber-900/15 to-transparent" />

      <motion.div
        ref={scrollRef}
        className="relative z-[5] max-h-[min(72vh,720px)] overflow-y-auto overscroll-y-contain scroll-smooth px-4 py-14 md:px-8"
        onScroll={handleScroll}
      >
        <motion.div style={{ y: parallaxBack }} className="space-y-8 pb-12">
          <p className="text-center text-[10px] tracking-[0.35em] text-amber-900/40">
            远 ───────── 时光 ───────── 近
          </p>
          {sorted.map((item) => (
            <MemoryScrollEntry
              key={item.id}
              item={item}
              now={now}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId((id) => (id === item.id ? null : item.id))
              }
              onDelete={() => onDelete(item)}
              onTag={(tag) => toast.success(`已标记「${tag}」（本地提示）`)}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  )
}
