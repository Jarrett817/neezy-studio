import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  addKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  saveKnowledgeItem,
  type KnowledgeItem,
} from "~/services/workspace"

export default function KnowledgeBaseRoute() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<KnowledgeItem>({
    title: "",
    category: "默认库",
    content: "",
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const { data: items = [] } = useQuery({
    queryKey: ["knowledge-items"],
    queryFn: listKnowledgeItems,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["knowledge-items"] })
    queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] })
  }

  const addMutation = useMutation({
    mutationFn: addKnowledgeItem,
    onSuccess: () => {
      setDraft({ title: "", category: "默认库", content: "" })
      refresh()
    },
  })
  const saveMutation = useMutation({
    mutationFn: saveKnowledgeItem,
    onSuccess: () => {
      setEditingId(null)
      setDraft({ title: "", category: "默认库", content: "" })
      refresh()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeItem,
    onSuccess: refresh,
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

  const isEditing = Boolean(editingId)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-base font-semibold">知识库</h1>
        <p className="text-sm text-muted-foreground">
          支持新增、编辑、检索和分类管理。这里是给 Agent 真正喂上下文的地方。
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input
            placeholder="标题"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <Input
            placeholder="分类"
            value={draft.category}
            onChange={(event) =>
              setDraft({ ...draft, category: event.target.value })
            }
          />
        </div>
        <Textarea
          className="mt-3 min-h-36"
          placeholder="粘贴知识、案例、账号规则、选题素材、口径限制..."
          value={draft.content}
          onChange={(event) =>
            setDraft({ ...draft, content: event.target.value })
          }
        />
        {addMutation.error instanceof Error ? (
          <p className="mt-2 text-sm text-destructive">{addMutation.error.message}</p>
        ) : null}
        {saveMutation.error instanceof Error ? (
          <p className="mt-2 text-sm text-destructive">{saveMutation.error.message}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {isEditing ? "正在编辑现有条目" : "新增知识条目"}
          </p>
          <div className="flex gap-2">
            {isEditing ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setEditingId(null)
                  setDraft({ title: "", category: "默认库", content: "" })
                }}
              >
                <X className="size-4" />
                取消编辑
              </Button>
            ) : null}
            <Button
              className="gap-2"
              disabled={
                !draft.title.trim() ||
                !draft.content.trim() ||
                addMutation.isPending ||
                saveMutation.isPending
              }
              onClick={() => {
                if (editingId) {
                  saveMutation.mutate({ ...draft, id: editingId })
                } else {
                  addMutation.mutate({
                    title: draft.title,
                    content: draft.content,
                    category: draft.category,
                  })
                }
              }}
            >
              <Plus className="size-4" />
              {isEditing ? "保存修改" : "写入知识库"}
            </Button>
          </div>
        </div>
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
          placeholder="搜索标题、分类或正文"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {item.category}
                  </span>
                  {item.updatedAt ? (
                    <span className="text-xs text-muted-foreground">
                      更新于 {new Date(Number(item.updatedAt)).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.content}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setEditingId(item.id ?? null)
                    setDraft({
                      id: item.id,
                      title: item.title,
                      category: item.category,
                      content: item.content,
                      updatedAt: item.updatedAt,
                    })
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => item.id && deleteMutation.mutate(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
