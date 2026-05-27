import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  BookOpenText,
  FolderUp,
  Image as ImageIcon,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react"
import { useRef } from "react"

import { Button } from "~/components/ui/button"
import {
  deleteSkill,
  importSkillArchive,
  importSkillFolder,
  listSkills,
  setSkillEnabled,
  type AgentSkill,
} from "~/services/workspace"

export default function SkillsRoute() {
  const queryClient = useQueryClient()
  const archiveInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["skills"] })

  const importArchiveMutation = useMutation({
    mutationFn: importSkillArchive,
    onSuccess: refresh,
  })
  const importFolderMutation = useMutation({
    mutationFn: importSkillFolder,
    onSuccess: refresh,
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setSkillEnabled(id, enabled),
    onSuccess: refresh,
  })
  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onSuccess: refresh,
  })

  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={refresh}
          aria-label="刷新"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <input
        ref={archiveInputRef}
        className="hidden"
        type="file"
        accept=".zip,application/zip"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          importArchiveMutation.mutate({
            archiveName: file.name,
            archiveBase64: await fileToBase64(file),
          })
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={folderInputRef}
        className="hidden"
        type="file"
        multiple
        {...({ webkitdirectory: "" } as React.HTMLAttributes<HTMLInputElement>)}
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          if (!files.length) return
          const folderName =
            files[0].webkitRelativePath.split("/")[0] || `skill-${Date.now()}`
          const payload = await Promise.all(
            files.map(async (file) => ({
              relativePath: file.webkitRelativePath || file.name,
              bytesBase64: await fileToBase64(file),
            }))
          )
          importFolderMutation.mutate({ folderName, files: payload })
          event.currentTarget.value = ""
        }}
      />

      {/* 导入选项 */}
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className="group rounded-2xl bg-card/60 p-5 text-left transition-all hover:bg-card/80"
          onClick={() => archiveInputRef.current?.click()}
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600 transition-colors group-hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400">
              <Archive className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">导入 ZIP 包</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                skill-creator 打包的完整技能包
              </p>
            </div>
          </div>
        </button>
        <button
          type="button"
          className="group rounded-2xl bg-card/60 p-5 text-left transition-all hover:bg-card/80"
          onClick={() => folderInputRef.current?.click()}
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 transition-colors group-hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400">
              <FolderUp className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">导入文件夹</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                包含 SKILL.md 的 skill 文件夹
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Skill 列表 */}
      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <SlidersHorizontal className="mb-3 size-10 text-muted-foreground/30" />
          <p className="text-sm font-medium">还没有安装 Skill</p>
          <p className="mt-1 text-xs text-muted-foreground">
            导入一个 Skill 包开始扩展能力
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              busy={
                toggleMutation.isPending ||
                deleteMutation.isPending ||
                importArchiveMutation.isPending ||
                importFolderMutation.isPending
              }
              onToggle={(enabled) =>
                toggleMutation.mutate({ id: skill.id, enabled })
              }
              onDelete={() => deleteMutation.mutate(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SkillCard({
  skill,
  busy,
  onToggle,
  onDelete,
}: {
  skill: AgentSkill
  busy: boolean
  onToggle: (enabled: boolean) => void
  onDelete: () => void
}) {
  return (
    <div className="group rounded-2xl bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{skill.name}</p>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
              {skill.sourceKind}
            </span>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
              {skill.fileCount} 个文件
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{skill.description}</p>
          <div className="flex flex-wrap gap-2">
            {skill.hasScripts && (
              <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                <Wrench className="size-3" /> scripts
              </span>
            )}
            {skill.hasReferences && (
              <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                <BookOpenText className="size-3" /> references
              </span>
            )}
            {skill.hasAssets && (
              <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                <ImageIcon className="size-3" /> assets
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={skill.enabled}
              disabled={busy}
              onChange={(e) => onToggle(e.target.checked)}
              className="size-3.5 rounded accent-primary"
            />
            <span className="text-muted-foreground">启用</span>
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-red-500 hover:text-red-600"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-muted/30 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          SKILL.md 指令摘录
        </p>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {skill.instructions || skill.prompt || "无可用指令"}
        </p>
      </div>
    </div>
  )
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
