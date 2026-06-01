import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router"
import { Search } from "lucide-react"

import { KnowledgeDocumentsPanel } from "~/components/knowledge/knowledge-documents-panel"
import { MemoryList } from "~/components/memory/memory-list"
import { Input } from "~/components/ui/input"
import {
  isKnowledgeCategory,
  isMemoryPanelCategory,
  MEMORY_CATEGORY,
} from "~/config/memory-categories"
import {
  deleteMemory,
  listMemories,
  searchMemoriesScoped,
  type MemoryItem,
} from "~/services/memories"

export function KnowledgeLibraryPanel() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState("")
  const [semanticQuery, setSemanticQuery] = useState("")
  const [semanticMode, setSemanticMode] = useState(false)
  const [searchResults, setSearchResults] = useState<MemoryItem[]>([])

  const { data: allMemories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: listMemories,
  })

  const items = useMemo(
    () => allMemories.filter((item) => isKnowledgeCategory(item.category)),
    [allMemories]
  )

  const memoryTabCount = useMemo(
    () => allMemories.filter((item) => isMemoryPanelCategory(item.category)).length,
    [allMemories]
  )

  useEffect(() => {
    if (!semanticQuery.trim()) {
      setSemanticMode(false)
      setSearchResults([])
    }
  }, [semanticQuery])

  const deleteMutation = useMutation({
    mutationFn: async (item: MemoryItem) => {
      await deleteMemory(item.id, item.file_path)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] })
    },
  })

  const filtered = useMemo(() => {
    const base = semanticMode ? searchResults : items
    if (!keyword.trim()) return base
    const q = keyword.toLowerCase()
    return base.filter((item) =>
      `${item.title} ${item.content}`.toLowerCase().includes(q)
    )
  }, [items, keyword, searchResults, semanticMode])

  const runSemanticSearch = async () => {
    const q = semanticQuery.trim()
    if (!q) {
      setSemanticMode(false)
      setSearchResults([])
      return
    }
    const found = await searchMemoriesScoped(q, {
      limit: 24,
      category: MEMORY_CATEGORY.KNOWLEDGE,
    })
    setSearchResults(found)
    setSemanticMode(true)
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
        {memoryTabCount > 0 && items.length === 0 && !semanticMode ? (
          <p className="text-xs text-muted-foreground">
            另有 {memoryTabCount} 条对话记忆，请在上方切换到
            <Link
              to="/knowledge?tab=memory"
              className="mx-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              记忆
            </Link>
            查看
          </p>
        ) : null}
        <MemoryList
          items={filtered}
          emptyMessage={
            semanticMode
              ? "未找到相关知识，可清空搜索框查看全部"
              : "暂无知识条目，可导入文档或让对话写入"
          }
          onDelete={(item) => deleteMutation.mutate(item)}
        />
      </div>
    </div>
  )
}
