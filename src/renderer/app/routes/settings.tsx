import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderOpen, HardDrive, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { useEffect, useState } from "react"

import { Link } from "react-router"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { resetDbCache } from "~/services/db"
import { resetMigrateDbCache } from "~/services/db/migrate"
import { AgentPermissionsSection } from "~/components/settings/agent-permissions-section"
import {
  getStoragePaths,
  pickStorageDirectory,
  resetStoragePaths,
  saveStoragePaths,
  type StoragePaths,
  type StoragePathsInput,
} from "~/services/storage-paths"

export default function SettingsRoute() {
  return (
    <div className="space-y-8 pt-4">
      <StoragePathsSection />
      <AgentPermissionsSection />
      <RuntimeSection />
    </div>
  )
}

function StoragePathsSection() {
  const queryClient = useQueryClient()
  const { data: paths, isLoading } = useQuery({
    queryKey: ["storage-paths"],
    queryFn: getStoragePaths,
  })
  const [draft, setDraft] = useState<StoragePathsInput | null>(null)

  useEffect(() => {
    if (paths) {
      setDraft({ dataRoot: paths.dataRoot })
    }
  }, [paths])

  const saveMutation = useMutation({
    mutationFn: saveStoragePaths,
    onSuccess: (next) => {
      resetDbCache()
      resetMigrateDbCache()
      queryClient.setQueryData(["storage-paths"], next)
      setDraft({ dataRoot: next.dataRoot })
      if (next.migration && next.migration.movedCount > 0) {
        toast.success("存储路径已保存，数据已迁移", {
          description: `已移动 ${next.migration.movedCount} 项至新目录，请重启应用后继续使用。`,
        })
      } else {
        toast.success("存储路径已保存", {
          description: "请重启应用以确保数据库与模型路径生效。",
        })
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败")
    },
  })

  const resetMutation = useMutation({
    mutationFn: resetStoragePaths,
    onSuccess: (next) => {
      resetDbCache()
      resetMigrateDbCache()
      queryClient.setQueryData(["storage-paths"], next)
      setDraft({ dataRoot: next.dataRoot })
      if (next.migration && next.migration.movedCount > 0) {
        toast.success("已恢复默认存储位置，数据已迁回", {
          description: `已移动 ${next.migration.movedCount} 项，请重启应用。`,
        })
      } else {
        toast.success("已恢复系统默认存储位置")
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复失败")
    },
  })

  const pickFolder = async (field: keyof StoragePathsInput) => {
    if (!draft) return
    const selected = await pickStorageDirectory({
      title: "选择存储目录",
      defaultPath: draft[field],
    })
    if (selected) setDraft({ ...draft, [field]: selected })
  }

  if (isLoading || !paths || !draft) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            存储位置
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <HardDrive className="size-5 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">
          存储位置
        </h2>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <PathField
          id="dataRoot"
          label="存储目录"
          hint="包含 memories.db、memories/、personas/、skills/、playbooks/scenes/ 等；models/ 仅放内置 Embedding。修改目录时会自动迁移已有数据（目标须为空目录）"
          value={draft.dataRoot}
          onChange={(value) => setDraft({ ...draft, dataRoot: value })}
          onBrowse={() => pickFolder("dataRoot")}
        />

        <DerivedPaths paths={paths} draft={draft} />

        <p className="text-xs text-muted-foreground">
          路径配置文件：
          <span className="font-mono break-all">{paths.configFile}</span>
          {paths.isCustomized ? "（已自定义）" : "（使用默认）"}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="rounded-xl"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(draft)}
          >
            {saveMutation.isPending ? "保存中..." : "保存存储路径"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
          >
            {resetMutation.isPending ? "恢复中..." : "恢复默认位置"}
          </Button>
        </div>
      </div>
    </section>
  )
}

function PathField({
  id,
  label,
  hint,
  value,
  onChange,
  onBrowse,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  onBrowse: () => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent font-mono text-xs"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={onBrowse}
          title="选择文件夹"
        >
          <FolderOpen className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function DerivedPaths({
  paths,
  draft,
}: {
  paths: StoragePaths
  draft: StoragePathsInput
}) {
  const previewDb = `${draft.dataRoot.replace(/\\/g, "/")}/memories.db`
  const previewMemories = `${draft.dataRoot.replace(/\\/g, "/")}/memories/`
  const previewModels = `${draft.dataRoot.replace(/\\/g, "/")}/models/`
  const defaultNote =
    draft.dataRoot === paths.defaultDataRoot
      ? "当前为系统默认路径"
      : "保存后生效；换目录时会自动迁移已有数据（目标须为空目录）"

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">保存后将使用</p>
      <ul className="space-y-1 font-mono break-all">
        <li>数据库：{previewDb}</li>
        <li>记忆 Markdown：{previewMemories}</li>
        <li>内置 Embedding：{previewModels}</li>
      </ul>
      <p className="mt-2">{defaultNote}</p>
    </div>
  )
}

function RuntimeSection() {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">运行时</h2>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">AI 连接</p>
          <p className="text-xs text-muted-foreground">
            Coding Plan 与 API Key 请在专用页面配置。
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 rounded-xl">
          <Link to="/connect">前往 AI 连接</Link>
        </Button>
      </div>
    </section>
  )
}
