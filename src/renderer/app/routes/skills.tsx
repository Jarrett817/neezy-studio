import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderOpen, RefreshCw, Trash2, Upload } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import {
  importSkillFromPath,
  importSkillsFromDrop,
  listSkills,
  type AgentSkill,
  uninstallSkill,
} from "~/services/skills"
import { getElectronApi } from "~/services/electron-client"
import { cn } from "~/lib/utils"

export default function SkillsRoute() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)

  const { data: installed = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["skills"] })

  const importMutation = useMutation({
    mutationFn: (paths: string[]) => Promise.all(paths.map(importSkillFromPath)),
    onSuccess: (skills) => {
      toast.success(`已导入 ${skills.length} 个 skill`)
      refresh()
    },
    onError: (err: Error) => toast.error(err.message || "导入失败"),
  })

  const dropMutation = useMutation({
    mutationFn: importSkillsFromDrop,
    onSuccess: (skills) => {
      toast.success(`已导入 ${skills.length} 个 skill`)
      refresh()
    },
    onError: (err: Error) => toast.error(err.message || "导入失败"),
  })

  const uninstallMutation = useMutation({
    mutationFn: uninstallSkill,
    onSuccess: () => {
      toast.success("已卸载")
      refresh()
    },
    onError: (err: Error) => toast.error(err.message || "卸载失败"),
  })

  const importing = importMutation.isPending || dropMutation.isPending

  const onPickFolder = async () => {
    try {
      const dir = await getElectronApi().pickDirectory({ title: "选择 skill 文件夹" })
      if (!dir) return
      importMutation.mutate([dir])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "选择文件夹失败")
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = [...e.dataTransfer.files]
    if (files.length === 0) return
    dropMutation.mutate(files)
  }

  return (
    <div className="w-full space-y-6 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">技能</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            拖入含 SKILL.md 的文件夹（或 SKILL.md 本身）即可本地导入，供 Agent 调用。
          </p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={refresh}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/70 bg-muted/15"
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/60">
          <Upload className="size-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">拖入 skill 文件夹</p>
          <p className="mt-1 text-xs text-muted-foreground">
            需包含 SKILL.md · 落盘至 skills/local/
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={importing}
          onClick={() => void onPickFolder()}
        >
          <FolderOpen className="size-4" />
          选择文件夹
        </Button>
      </div>

      {installed.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">已安装</h2>
          {installed.map((skill) => (
            <InstalledSkillRow
              key={skill.id}
              skill={skill}
              busy={uninstallMutation.isPending}
              onUninstall={() => uninstallMutation.mutate(skill.id)}
            />
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">还没有导入任何 skill。</p>
      )}
    </div>
  )
}

function InstalledSkillRow({
  skill,
  busy,
  onUninstall,
}: {
  skill: AgentSkill
  busy: boolean
  onUninstall: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{skill.name}</p>
          <Badge variant="outline" className="text-[10px]">
            本地
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
      </div>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onUninstall}>
        <Trash2 className="size-3.5" />
        卸载
      </Button>
    </div>
  )
}
