import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Settings2, Trash2, Wand2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  SCENE_CHAT_LAUNCH_STATE,
  sceneChatPath,
} from "~/lib/scene-chat-nav"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  deleteUserPlaybook,
  ensurePlaybookDirs,
  listPlaybooks,
} from "~/services/playbook"

export default function CreateRoute() {
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const { data: playbooks = [], isLoading, isError, error } = useQuery({
    queryKey: ["playbooks"],
    queryFn: async () => {
      await ensurePlaybookDirs()
      return listPlaybooks()
    },
  })

  const runnable = playbooks.filter((p) => p.id !== "playbook-designer")
  const builtin = runnable.filter((p) => p.builtin)
  const userScenes = runnable.filter((p) => !p.builtin)
  const designer = playbooks.find((p) => p.id === "playbook-designer")

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUserPlaybook(id),
    onSuccess: async () => {
      toast.success("场景已删除")
      await queryClient.invalidateQueries({ queryKey: ["playbooks"] })
      setPendingDelete(null)
    },
    onError: (err: Error) => {
      toast.error(err.message || "删除失败")
    },
  })

  return (
    <div className="w-full space-y-8 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">创作任务</p>
          <h1 className="text-2xl font-semibold tracking-tight">选择场景</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            选择场景运行，或在工作室用 Agent 生成新场景。
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 shrink-0 rounded-2xl px-5">
          <Link to="/chat">对话历史</Link>
        </Button>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载场景失败"}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">加载场景…</p>
      ) : (
        <div className="space-y-8">
          {userScenes.length > 0 ? (
            <section className="space-y-3">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  我的场景
                </h2>
                <Button asChild variant="ghost" size="sm" className="rounded-xl text-xs">
                  <Link to="/studio/playbook-designer">
                    <Plus className="size-3.5" />
                    新建
                  </Link>
                </Button>
              </header>
              <div className="grid gap-3 sm:grid-cols-2">
                {userScenes.map((playbook) => (
                  <SceneCard
                    key={playbook.id}
                    id={playbook.id}
                    name={playbook.name}
                    description={playbook.description}
                    onDelete={() => setPendingDelete(playbook.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {builtin.length > 0 ? (
            <section className="space-y-3">
              <header>
                <h2 className="text-sm font-semibold text-muted-foreground">
                  内置场景
                </h2>
              </header>
              <div className="grid gap-3 sm:grid-cols-2">
                {builtin.map((playbook) => (
                  <SceneCard
                    key={playbook.id}
                    id={playbook.id}
                    name={playbook.name}
                    description={playbook.description}
                    builtin
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {designer ? (
        <Card className="rounded-2xl border border-dashed border-border/60 bg-muted/30 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10">
                <Wand2 className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{designer.name}</p>
                <p className="text-xs text-muted-foreground">{designer.description}</p>
              </div>
            </div>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/studio/playbook-designer">
                <Plus className="mr-1 size-4" />
                对话创建场景
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除场景？</DialogTitle>
            <DialogDescription>该操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-xl">取消</Button>
            </DialogClose>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SceneCard({
  id,
  name,
  description,
  builtin,
  onDelete,
}: {
  id: string
  name: string
  description: string
  builtin?: boolean
  onDelete?: () => void
}) {
  return (
    <Card className="relative rounded-2xl border border-border/60 bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="line-clamp-1">{name}</span>
          {builtin ? (
            <Badge variant="secondary" className="text-[10px]">内置</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
          {description}
        </p>
        <div className="flex gap-2">
          <Button asChild className="h-10 flex-1 rounded-xl text-sm">
            <Link to={sceneChatPath(id)} state={SCENE_CHAT_LAUNCH_STATE}>开始创作</Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-10 rounded-xl">
            <Link to={`/scenes/${encodeURIComponent(id)}`} aria-label="查看配置">
              <Settings2 className="size-4" />
            </Link>
          </Button>
          {!builtin && onDelete ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="删除场景"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
