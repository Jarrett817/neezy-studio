import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Copy,
  Edit3,
  FileCode2,
  Hash,
  Play,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
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
  getInputProfile,
  getPlaybook,
  saveUserScene,
} from "~/services/playbook/storage"
import type { InputProfile, Playbook } from "~/services/playbook/types"

type Draft = {
  playbook: Playbook
  profile: InputProfile
}

export default function SceneDetailRoute() {
  const { playbookId = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["scene-detail", playbookId],
    queryFn: async (): Promise<Draft | null> => {
      const playbook = await getPlaybook(playbookId)
      if (!playbook) return null
      const profile = await getInputProfile(playbook.inputProfileId)
      if (!profile) return null
      return { playbook, profile }
    },
    enabled: Boolean(playbookId),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUserPlaybook(playbookId),
    onSuccess: async () => {
      toast.success("场景已删除")
      await queryClient.invalidateQueries({ queryKey: ["playbooks"] })
      navigate("/scenes", { replace: true })
    },
    onError: (err: Error) => {
      toast.error(err.message || "删除失败")
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("未找到场景")
      const suffix = Date.now().toString(36).slice(-4)
      const newId = `${data.playbook.id}-copy-${suffix}`
      const newProfileId = `${data.profile.id}-copy-${suffix}`
      return saveUserScene({
        playbook: {
          ...data.playbook,
          id: newId,
          builtin: false,
          inputProfileId: newProfileId,
          name: `${data.playbook.name} 副本`,
        },
        inputProfile: {
          ...data.profile,
          id: newProfileId,
        },
      })
    },
    onSuccess: async (saved) => {
      toast.success("已复制为新场景")
      await queryClient.invalidateQueries({ queryKey: ["playbooks"] })
      navigate(`/scenes/${saved.playbook.id}`)
    },
    onError: (err: Error) => {
      toast.error(err.message || "复制失败")
    },
  })

  if (isLoading) {
    return (
      <div className="pt-8 text-sm text-muted-foreground">
        加载场景…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="pt-8 text-sm text-destructive">
        {error instanceof Error ? error.message : "加载失败"}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-4 pt-8">
        <p className="text-sm text-destructive">未找到该场景</p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/scenes">返回场景库</Link>
        </Button>
      </div>
    )
  }

  const { playbook, profile } = data
  const isBuiltin = Boolean(playbook.builtin)

  return (
    <div className="w-full space-y-6 pt-4 pb-12">
      <Button asChild variant="ghost" size="sm" className="w-fit gap-2 rounded-xl">
        <Link to="/scenes">
          <ArrowLeft className="size-4" />
          场景库
        </Link>
      </Button>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {playbook.name}
              </h1>
              {isBuiltin ? (
                <Badge variant="secondary">内置</Badge>
              ) : (
                <Badge variant="outline">我的场景</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{playbook.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-xl">
              <Link to={sceneChatPath(playbook.id)} state={SCENE_CHAT_LAUNCH_STATE}>
                <Play className="size-4" />
                运行
              </Link>
            </Button>
            {!isBuiltin ? (
              <>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link
                    to={`/scenes/designer?edit=${encodeURIComponent(playbook.id)}`}
                  >
                    <Edit3 className="size-4" />
                    编辑
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={duplicateMutation.isPending}
                  onClick={() => duplicateMutation.mutate()}
                >
                  <Copy className="size-4" />
                  复制
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="size-4 text-primary" />
            输入字段
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">未配置输入字段</p>
          ) : (
            <ul className="space-y-2">
              {profile.fields.map((field) => (
                <li
                  key={field.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.label}</span>
                      {field.required ? (
                        <span className="text-xs text-destructive">必填</span>
                      ) : null}
                      <Badge variant="secondary" className="font-mono text-xs">
                        {field.type ?? "text"}
                      </Badge>
                    </div>
                    {field.type === "rich-text" && field.template ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {field.template}
                      </p>
                    ) : null}
                    {field.chip && (field.chips?.length || field.options?.length) ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(field.chips ?? field.options ?? []).map((opt) => (
                          <Badge
                            key={String(opt)}
                            variant="outline"
                            className="text-xs"
                          >
                            {String(opt)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <code className="font-mono text-xs text-muted-foreground">
                    {field.key}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode2 className="size-4 text-primary" />
            Prompt 模板
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
{profile.promptTemplate}
          </pre>
        </CardContent>
      </Card>

      {playbook.memoryScope ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">记忆检索范围</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Top K：{playbook.memoryScope.topK ?? 5}</p>
            {playbook.memoryScope.categories?.length ? (
              <p>分类：{playbook.memoryScope.categories.join("、")}</p>
            ) : null}
            {playbook.memoryScope.tags?.length ? (
              <p>标签：{playbook.memoryScope.tags.join("、")}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除场景「{playbook.name}」？</DialogTitle>
            <DialogDescription>
              该操作不可撤销。本地存储的场景配置将永久删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-xl">取消</Button>
            </DialogClose>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
