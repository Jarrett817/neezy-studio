import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  addKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
} from "~/services/workspace"

export default function KnowledgeBaseRoute() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("默认库")
  const [content, setContent] = useState("")
  const [activeCategory, setActiveCategory] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const { data: items = [] } = useQuery({
    queryKey: ["knowledge-items"],
    queryFn: listKnowledgeItems,
  })
  const addMutation = useMutation({
    mutationFn: addKnowledgeItem,
    onSuccess: () => {
      setTitle("")
      setContent("")
      queryClient.invalidateQueries({ queryKey: ["knowledge-items"] })
      queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-items"] })
      queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] })
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
    <div className="space-y-5">
      <div>
        <h1 className="text-base font-semibold">知识库</h1>
        <p className="text-sm text-muted-foreground">
          用库名区分不同知识库，Agent 会按需求召回相关内容。
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input
            placeholder="标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Input
            placeholder="库名"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        <Textarea
          className="mt-3"
          placeholder="粘贴知识、案例、账号规则或素材"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        {addMutation.error instanceof Error ? (
          <p className="mt-2 text-sm text-destructive">
            {addMutation.error.message}
          </p>
        ) : null}
        <Button
          className="mt-3 gap-2"
          disabled={!title.trim() || !content.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate({ title, content, category })}
        >
          <Plus className="size-4" />
          写入知识库
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <Button
            key={item}
            variant={item === activeCategory ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="搜索知识"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {item.category}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.content}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => item.id && deleteMutation.mutate(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
