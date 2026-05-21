import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"

import { MemoryTimeScroll } from "~/components/memory/memory-time-scroll"
import { FadeIn } from "~/components/animation-effects"
import { Input } from "~/components/ui/input"
import {
  listMemories,
  deleteMemory,
  type MemoryItem,
} from "~/services/memories"

export default function KnowledgeBaseRoute() {
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState("全部")
  const [keyword, setKeyword] = useState("")

  const { data: items = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: listMemories,
  })

  const deleteMutation = useMutation({
    mutationFn: async (item: MemoryItem) => {
      await deleteMemory(item.id, item.file_path)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] })
    },
  })

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(items.map((item) => item.category)))],
    [items]
  )

  const filtered = items.filter((item) => {
    const categoryMatched =
      activeCategory === "全部" || item.category === activeCategory
    const text = `${item.title} ${item.category} ${item.content}`.toLowerCase()
    return categoryMatched && text.includes(keyword.toLowerCase())
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pt-2 pb-8">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight">
              记忆
            </h1>
            <p className="text-xs text-muted-foreground">
              {items.length} 条 · 时光卷轴由远及近
            </p>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.04}>
        <div className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActiveCategory(item)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                item === activeCategory
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-card/60 text-muted-foreground hover:bg-card hover:shadow-sm"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.06}>
        <div className="relative">
          <div className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2">
            <Search className="size-4 text-muted-foreground" />
          </div>
          <Input
            className="border-border/40 bg-card/60 pl-10"
            placeholder="搜索卷轴中的记忆…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      </FadeIn>

      <FadeIn delay={0.08} className="min-h-0 flex-1">
        <MemoryTimeScroll
          className="w-full"
          items={filtered}
          onDelete={(item) => deleteMutation.mutate(item)}
        />
      </FadeIn>
    </div>
  )
}
