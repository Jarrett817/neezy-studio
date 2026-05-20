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
import { FadeIn } from "~/components/animation-effects"
import { cn } from "~/lib/utils"
import { MemoryNebulaScene } from "~/components/r3f/memory-nebula"
import { MemoryCard3D, Scene3DStage, scene3dClass } from "~/components/scene-3d"
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
    <Scene3DStage className="space-y-6 pt-4 pb-8" accent="cool">
      <FadeIn>
        <p className="text-center text-xs tabular-nums text-muted-foreground">
          {items.length} 条记忆
        </p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
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
        <div className="overflow-hidden rounded-2xl border border-border/30 bg-card/20">
          <MemoryNebulaScene count={items.length} heightClass="h-[180px]" />
        </div>
      </FadeIn>

      <FadeIn delay={0.08}>
        <div className="relative">
          <div className="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 items-center justify-center">
            <Search className="size-4 text-muted-foreground" />
          </div>
          <Input
            className="border-none bg-card/60 pl-10 shadow-sm backdrop-blur-sm"
            placeholder="搜索记忆..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      </FadeIn>

      {filtered.length === 0 ? (
        <FadeIn delay={0.1}>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/20 py-20">
            <Brain className="size-12 text-muted-foreground/25" />
          </div>
        </FadeIn>
      ) : (
        <div className={cn(scene3dClass.preserve, "grid gap-4 md:grid-cols-2")}>
          {filtered.map((item, index) => (
            <MemoryCard3D key={item.id} index={index}>
              <div className="group relative rounded-2xl border border-border/40 bg-card/70 p-4 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-colors hover:border-primary/25 hover:bg-card/90">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.content.length > 140
                        ? item.content.slice(0, 140) + "…"
                        : item.content}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-red-500 hover:text-red-600"
                        >
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
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(item)}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </MemoryCard3D>
          ))}
        </div>
      )}
    </Scene3DStage>
  )
}
