import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpenText, Lightbulb, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"

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
  const [draft, setDraft] = useState<KnowledgeItem>({ title: "", category: "默认库", content: "" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null)
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
      setShowForm(false)
      refresh()
    },
  })
  const saveMutation = useMutation({
    mutationFn: saveKnowledgeItem,
    onSuccess: () => {
      setEditingId(null)
      setDraft({ title: "", category: "默认库", content: "" })
      setShowForm(false)
      refresh()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeItem,
    onSuccess: () => {
      setDeleteTarget(null)
      refresh()
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

  const isEditing = Boolean(editingId)

  return (
    <div className="space-y-6 pt-4">
      {/* 头部操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">知识库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} 条知识 · 让 AI 更懂你的业务
          </p>
        </div>
        <Button size="sm" className="gap-2 rounded-xl" onClick={() => setShowForm(!showForm)}>
          <Plus className="size-4" />
          新增
        </Button>
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <div className="glass-warm rounded-2xl border border-border/10 p-5 space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              <p className="text-sm font-semibold">{isEditing ? "编辑知识" : "新增知识"}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => { setShowForm(false); setEditingId(null); setDraft({ title: "", category: "默认库", content: "" }) }}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="标题" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="bg-transparent" />
            <Input placeholder="分类" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="bg-transparent" />
          </div>
          <Textarea
            className="min-h-28 resize-none bg-transparent border-none shadow-none"
            placeholder="粘贴知识、案例、规则、素材..."
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setDraft({ title: "", category: "默认库", content: "" }) }}>取消</Button>
            <Button
              size="sm"
              className="gap-2 rounded-xl"
              disabled={!draft.title.trim() || !draft.content.trim()}
              onClick={() => {
                if (editingId) {
                  saveMutation.mutate({ ...draft, id: editingId })
                } else {
                  addMutation.mutate({ title: draft.title, content: draft.content, category: draft.category })
                }
              }}
            >
              {isEditing ? "保存" : "写入"}
            </Button>
          </div>
        </div>
      )}

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
          placeholder="搜索知识..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 知识列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpenText className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">还没有知识条目</p>
          <p className="mt-1 text-xs text-muted-foreground">点击「新增」添加第一条记录</p>
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
                  <Button variant="ghost" size="icon-sm" onClick={() => { setEditingId(item.id ?? null); setDraft({ id: item.id, title: item.title, category: item.category, content: item.content, updatedAt: item.updatedAt }); setShowForm(true) }}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(item)}>
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
                        <AlertDialogAction onClick={() => item.id && deleteMutation.mutate(item.id)} className="bg-red-500 hover:bg-red-600">
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