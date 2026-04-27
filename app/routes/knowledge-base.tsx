import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useState } from "react"

import { SectionHeading } from "~/components/section-heading"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { addKnowledgeItem, getWorkspaceSnapshot } from "~/services/workspace"

export default function KnowledgeBaseRoute() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("素材")
  const [content, setContent] = useState("")
  const { data: snapshot } = useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: getWorkspaceSnapshot,
  })
  const addMutation = useMutation({
    mutationFn: addKnowledgeItem,
    onSuccess: () => {
      setTitle("")
      setContent("")
      queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] })
    },
  })

  const items = snapshot?.knowledge ?? []

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="知识库"
        title="真实素材库"
        description="当前只展示本机真实数据；未接入写入功能前不会放占位素材。"
      />

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="搜索真实素材" />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <Input
              placeholder="标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              placeholder="分类"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </div>
          <Textarea
            placeholder="粘贴真实素材、爆款笔记拆解、账号复盘等内容"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          {addMutation.error instanceof Error ? (
            <p className="text-sm text-destructive">
              {addMutation.error.message}
            </p>
          ) : null}
          <Button
            className="gap-2"
            disabled={!title.trim() || !content.trim() || addMutation.isPending}
            onClick={() =>
              addMutation.mutate({
                title,
                content,
                category,
              })
            }
          >
            <Plus className="size-4" />
            {addMutation.isPending ? "写入中" : "写入知识库"}
          </Button>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
          暂无真实素材。
        </p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{item.title}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {item.category}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {item.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
