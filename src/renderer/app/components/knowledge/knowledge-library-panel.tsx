import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"

import { KnowledgeDocumentsPanel } from "~/components/knowledge/knowledge-documents-panel"
import { MemoryList } from "~/components/memory/memory-list"
import { Input } from "~/components/ui/input"
import { MEMORY_CATEGORY } from "~/config/memory-categories"
import {
  deleteMemory,
  listMemoriesByCategory,
  searchMemoriesScoped,
  type MemoryItem,
} from "~/services/memories"

export function KnowledgeLibraryPanel() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState("")
  const [semanticQuery, setSemanticQuery] = useState("")
  const [searchResults, setSearchResults] = useState<MemoryItem[] | null>(null)

  const { data: items = [] } = useQuery({
    queryKey: ["knowledge-items"],
    queryFn: () => listMemoriesByCategory(MEMORY_CATEGORY.KNOWLEDGE),
  })

  const deleteMutation = useMutation({
    mutationFn: async (item: MemoryItem) => {
      await deleteMemory(item.id, item.file_path)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-items"] })
      void queryClient.invalidateQueries({ queryKey: ["memories"] })
    },
  })

  const filtered = useMemo(() => {
    const base = searchResults ?? items
    if (!keyword.trim()) return base
    const q = keyword.toLowerCase()
    return base.filter((item) =>
      `${item.title} ${item.content}`.toLowerCase().includes(q)
    )
  }, [items, keyword, searchResults])

  const runSemanticSearch = async () => {
    const q = semanticQuery.trim()
    if (!q) {
      setSearchResults(null)
      return
    }
    const found = await searchMemoriesScoped(q, {
      limit: 24,
      category: MEMORY_CATEGORY.KNOWLEDGE,
    })
    setSearchResults(found)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <KnowledgeDocumentsPanel />

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-xl border-border/60 bg-card pl-10 shadow-sm"
            placeholder="语义搜索知识…"
            value={semanticQuery}
            onChange={(e) => setSemanticQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSemanticSearch()
            }}
          />
        </div>
        <Input
          className="rounded-xl border-border/60 bg-card shadow-sm"
          placeholder="筛选…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{filtered.length} 条知识</p>
        <MemoryList
          className="min-h-0 flex-1"
          items={filtered}
          emptyMessage="暂无知识条目，可导入文档或让对话写入"
          onDelete={(item) => deleteMutation.mutate(item)}
        />
      </div>
    </div>
  )
}
