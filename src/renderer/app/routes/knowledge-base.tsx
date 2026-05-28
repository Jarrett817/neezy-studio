import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"

import { MemoryList } from "~/components/memory/memory-list"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">素材库</h1>
        <p className="text-xs text-muted-foreground">{items.length} 条记忆 · 按更新时间排序</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setActiveCategory(item)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              item === activeCategory
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border/60 bg-card text-muted-foreground hover:bg-muted/50"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-xl border-border/60 bg-card pl-10 shadow-sm"
          placeholder="搜索标题或内容…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <MemoryList
        className="min-h-0 flex-1"
        items={filtered}
        onDelete={(item) => deleteMutation.mutate(item)}
      />
    </div>
  )
}
