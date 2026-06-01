import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"

import { MemoryList } from "~/components/memory/memory-list"
import { Input } from "~/components/ui/input"
import {
  isMemoryPanelCategory,
  MEMORY_CATEGORY,
} from "~/config/memory-categories"
import {
  deleteMemory,
  listMemories,
  searchMemoriesScoped,
  type MemoryItem,
} from "~/services/memories"

export function MemoriesPanel() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState("")
  const [semanticQuery, setSemanticQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [semanticMode, setSemanticMode] = useState(false)
  const [searchResults, setSearchResults] = useState<MemoryItem[]>([])

  const { data: allMemories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: listMemories,
  })

  const items = useMemo(
    () => allMemories.filter((item) => isMemoryPanelCategory(item.category)),
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
    setSearching(true)
    try {
      const found = await searchMemoriesScoped(q, {
        limit: 20,
        category: MEMORY_CATEGORY.MEMORY,
      })
      setSearchResults(found)
      setSemanticMode(true)
    } finally {
      setSearching(false)
    }
  }

  const emptyMessage = semanticMode
    ? "未找到相关记忆，可清空搜索框查看全部"
    : "暂无记忆，可在对话中让助手写入素材库"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-xl border-border/60 bg-card pl-10 shadow-sm"
          placeholder="语义搜索记忆…"
          value={semanticQuery}
          onChange={(e) => setSemanticQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSemanticSearch()
          }}
        />
        {searching ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <Input
        className="rounded-xl border-border/60 bg-card shadow-sm"
        placeholder="筛选标题或正文…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      <p className="text-xs text-muted-foreground">
        {isLoading
          ? "加载中…"
          : semanticMode
            ? `语义搜索 ${filtered.length} 条 · 共 ${items.length} 条对话记忆`
            : `${filtered.length} 条对话记忆 · 对话中自动累积`}
      </p>

      <MemoryList
        items={filtered}
        emptyMessage={emptyMessage}
        onDelete={(item) => deleteMutation.mutate(item)}
      />
    </div>
  )
}
