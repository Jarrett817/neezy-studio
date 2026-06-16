import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Settings2, Sparkles, Trash2, Wand2 } from "lucide-react"
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

export default function SceneListRoute() {
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const { data: playbooks = [] } = useQuery({
    queryKey: ["playbooks"],
    queryFn: async () => {
      await ensurePlaybookDirs()
      return listPlaybooks()
    },
  })

  const runnable = playbooks.filter((p) => p.id !== "playbook-designer")
  const builtin = runnable.filter((p) => p.builtin)
  const userScenes = runnable.filter((p) => !p.builtin)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUserPlaybook(id),
    onSuccess: () => {
      toast.success("场景已删除")
      queryClient.invalidateQueries({ queryKey: ["playbooks"] })
      setPendingDelete(null)
    },
    onError: (err: Error) => toast.error(err.message || "删除失败"),
  })

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 py-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 p-7 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-primary">SCENE WORKBENCH</p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">场景</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              把高频任务封装成可复用工作卡片。每次运行都会创建一个专属对话，方便持续迭代。
            </p>
          </div>
          <Button asChild className="h-11 shrink-0 rounded-2xl px-5">
            <Link to="/scenes/designer">
              <Wand2 className="size-4" />
              对话创建
            </Link>
          </Button>
        </div>
      </div>

      {userScenes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">我的场景</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {userScenes.map((pb) => (
              <SceneCard
                key={pb.id}
                id={pb.id}
                name={pb.name}
                description={pb.description}
                onDelete={() => setPendingDelete(pb.id)}
              />
            ))}
          </div>
        </section>
      )}

      {builtin.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">内置场景</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {builtin.map((pb) => (
              <SceneCard
                key={pb.id}
                id={pb.id}
                name={pb.name}
                description={pb.description}
                builtin
              />
            ))}
          </div>
        </section>
      )}

      {runnable.length === 0 && (
        <Card className="rounded-2xl border border-dashed border-border/60 bg-muted/30 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10">
                <Wand2 className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">对话创建场景</p>
                <p className="text-xs text-muted-foreground">描述需求，AI 自动生成场景配置</p>
              </div>
            </div>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/scenes/designer">
                <Plus className="size-4" />
                开始创建
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
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
    <Card className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="line-clamp-1">{name}</span>
          {builtin ? <Badge variant="secondary" className="text-[10px]">内置</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
          {description}
        </p>
        <div className="flex gap-2">
          <Button asChild className="h-10 flex-1 rounded-xl text-sm">
            <Link to={sceneChatPath(id)} state={SCENE_CHAT_LAUNCH_STATE}>运行</Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-10 rounded-xl">
            <Link to={`/scenes/${encodeURIComponent(id)}`}>
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
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}