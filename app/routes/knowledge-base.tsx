import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Brain, Search, Trash2 } from "lucide-react"

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
import { Input } from "~/components/ui/input"
import { listMemories, deleteMemory, type MemoryItem } from "~/services/memories"

export default function KnowledgeBaseRoute() {
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null)

  const { data: items = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: listMemories,
  })

  const deleteMutation = useMutation({
    mutationFn: async (item: MemoryItem) => {
      await deleteMemory(item.id, item.file_path)
    },
    onSuccess: () => {
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ["memories"] })
    },
  })

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(items.map((item) => item.category)))],
    [items]
  )

  const filtered = items.filter((item) => {
    const categoryMatched = activeCategory === "全部" || item.category === activeCategory
    const text = `${item.title} ${item.category} ${item.content}`.toLowerCase()
    return categoryMatched && text.includes(keyword.toLowerCase())
  })

  return (
    <div className="space-y-6 pt-4">
      {/* 头部 */}
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">记忆</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} 条记忆 · AI 自动存储的重要信息
        </p>
      </div>

      {/* 分类标签 */}
      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            onClick={() => setActiveCategory(item)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              item === activeCategory ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:bg-card"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
          <Search className="size-4 text-muted-foreground" />
        </div>
        <Input
          className="pl-10 bg-card/60 border-none"
          placeholder="搜索记忆..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 记忆列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">还没有记忆</p>
          <p className="mt-1 text-xs text-muted-foreground">在对话中上传文件并描述想要记住的内容，AI 会自动存储</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-2xl bg-card/60 p-4 hover:bg-card/80 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">{item.category}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.content.length > 140 ? item.content.slice(0, 140) + "…" : item.content}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="text-red-500 hover:text-red-600">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除「{item.title}」吗？此操作无法撤销。
                      </AlertDialogDescription>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(item)} className="bg-red-500 hover:bg-red-600">
                          删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
