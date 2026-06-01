import { Trash2 } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { formatSessionTime } from "~/lib/format-session-time"
import { cn } from "~/lib/utils"
import type { MemoryItem } from "~/services/memories"

type MemoryListProps = {
  items: MemoryItem[]
  className?: string
  emptyMessage?: string
  onDelete?: (item: MemoryItem) => void
}

export function MemoryList({
  items,
  className,
  emptyMessage = "暂无条目",
  onDelete,
}: MemoryListProps) {
  if (items.length === 0) {
    return (
      <p className={cn("py-12 text-center text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </p>
    )
  }

  const sorted = [...items].sort((a, b) => b.updated_at - a.updated_at)

  return (
    <ul className={cn("space-y-3", className)}>
      {sorted.map((item) => {
        const updatedLabel = formatSessionTime(item.updated_at)
        return (
        <li
          key={item.id}
          className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold leading-snug">{item.title}</h3>
                <Badge variant="secondary" className="text-xs">
                  {item.category}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                {item.content}
              </p>
              {updatedLabel ? (
                <p className="mt-3 text-xs text-muted-foreground">{updatedLabel}</p>
              ) : null}
            </div>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl"
                onClick={() => onDelete(item)}
                aria-label="删除"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        </li>
        )
      })}
    </ul>
  )
}
