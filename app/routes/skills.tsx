import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  FolderUp,
  RefreshCw,
  Trash2,
  Wrench,
  BookOpenText,
  Image as ImageIcon,
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Skill 管理</h1>
          <p className="text-sm text-muted-foreground">
            支持导入 skill-creator 生成的标准 Skill 包，接受 `.zip` 或文件夹。
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={refresh}>
          <RefreshCw className="size-4" />
          刷新
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
        {...({ webkitdirectory: "" } as Record<string, string>)}
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

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className="rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => archiveInputRef.current?.click()}
        >
          <div className="flex items-center gap-3">
            <Archive className="size-5" />
            <div>
              <p className="text-sm font-medium">导入 ZIP Skill 包</p>
              <p className="text-xs text-muted-foreground">
                适合上传 skill-creator 打包好的完整技能包。
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          className="rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => folderInputRef.current?.click()}
        >
          <div className="flex items-center gap-3">
            <FolderUp className="size-5" />
            <div>
              <p className="text-sm font-medium">导入文件夹 Skill 包</p>
              <p className="text-xs text-muted-foreground">
                直接选择包含 `SKILL.md` 的 skill 文件夹。
              </p>
            </div>
          </div>
        </button>
      </div>

      {importArchiveMutation.error instanceof Error ? (
        <p className="text-sm text-destructive">
          {importArchiveMutation.error.message}
        </p>
      ) : null}
      {importFolderMutation.error instanceof Error ? (
        <p className="text-sm text-destructive">
          {importFolderMutation.error.message}
        </p>
      ) : null}

      <div className="grid gap-3">
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
            onToggle={(enabled) => toggleMutation.mutate({ id: skill.id, enabled })}
            onDelete={() => deleteMutation.mutate(skill.id)}
          />
        ))}
      </div>
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
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{skill.name}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {skill.sourceKind}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {skill.fileCount} 个文件
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{skill.description}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <FeatureChip show={skill.hasScripts} icon={Wrench} label="scripts" />
            <FeatureChip
              show={skill.hasReferences}
              icon={BookOpenText}
              label="references"
            />
            <FeatureChip show={skill.hasAssets} icon={ImageIcon} label="assets" />
          </div>
          {skill.skillMdPath ? (
            <p className="text-xs text-muted-foreground">{skill.skillMdPath}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skill.enabled}
              disabled={busy}
              onChange={(event) => onToggle(event.target.checked)}
            />
            启用
          </label>
          <Button variant="outline" size="icon" disabled={busy} onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">SKILL.md 指令摘录</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">
          {skill.instructions || skill.prompt || "无可用指令"}
        </p>
      </div>
    </div>
  )
}

function FeatureChip({
  show,
  icon: Icon,
  label,
}: {
  show: boolean
  icon: typeof Wrench
  label: string
}) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
