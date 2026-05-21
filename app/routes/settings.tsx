import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderOpen, HardDrive, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { useEffect, useState } from "react"

import { Link } from "react-router"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { cn } from "~/lib/utils"
import {
  getRuntimeMetrics,
  getRuntimeSettings,
  saveRuntimeSettings,
} from "~/services/workspace"
import { type RuntimeSettings } from "~/services/settings"
import { isModelLoaded, getCurrentModel } from "~/services/llm"
import { resetDbCache } from "~/services/db"
import { resetMigrateDbCache } from "~/services/db/migrate"
import {
  getStoragePaths,
  pickStorageDirectory,
  resetStoragePaths,
  saveStoragePaths,
  type StoragePaths,
  type StoragePathsInput,
} from "~/services/storage-paths"

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    staleTime: 5000,
  })
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeSettings | null>(null)

  const modelLoaded = isModelLoaded()
  const currentModel = getCurrentModel()

  useEffect(() => {
    if (runtimeSettings) setRuntimeDraft(runtimeSettings)
  }, [runtimeSettings])

  const saveRuntimeMutation = useMutation({
    mutationFn: saveRuntimeSettings,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["runtime-settings"], nextSettings)
      setRuntimeDraft(nextSettings)
    },
  })

  return (
    <div className="space-y-8 pt-4">
      <StoragePathsSection />
      <RuntimeSection
        metrics={metrics}
        modelReady={modelLoaded}
        currentModel={currentModel}
        runtimeDraft={runtimeDraft}
        setRuntimeDraft={setRuntimeDraft}
        onSave={saveRuntimeMutation}
      />
      <section className="rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-sm">
        <h2 className="font-display text-lg font-semibold">本地模型</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          模型下载与选择已移至独立页面，含塔罗式 3D 选牌体验。
        </p>
        <Button asChild className="mt-4 rounded-xl" variant="default">
          <Link to="/models">打开模型</Link>
        </Button>
      </section>
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
      setDraft({ dataRoot: paths.dataRoot, modelsDir: paths.modelsDir })
    }
  }, [paths])

  const saveMutation = useMutation({
    mutationFn: saveStoragePaths,
    onSuccess: (next) => {
      resetDbCache()
      resetMigrateDbCache()
      queryClient.setQueryData(["storage-paths"], next)
      setDraft({ dataRoot: next.dataRoot, modelsDir: next.modelsDir })
      toast.success("存储路径已保存", {
        description: "若已下载模型或已有数据，请手动复制到新目录后重启应用。",
      })
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
      setDraft({ dataRoot: next.dataRoot, modelsDir: next.modelsDir })
      toast.success("已恢复系统默认存储位置")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复失败")
    },
  })

  const pickFolder = async (field: keyof StoragePathsInput) => {
    if (!draft) return
    const selected = await pickStorageDirectory({
      title: field === "dataRoot" ? "选择数据目录" : "选择大模型目录",
      defaultPath: draft[field],
    })
    if (selected) setDraft({ ...draft, [field]: selected })
  }

  if (isLoading || !paths || !draft) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="size-5 text-primary" />
          <h2 className="font-display text-2xl font-semibold tracking-tight">
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
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          存储位置
        </h2>
      </div>

      <div className="space-y-4 rounded-2xl bg-card/60 p-4">
        <PathField
          id="dataRoot"
          label="数据目录"
          hint="包含 memories.db、memories/、personas/、skills/"
          value={draft.dataRoot}
          onChange={(value) => setDraft({ ...draft, dataRoot: value })}
          onBrowse={() => pickFolder("dataRoot")}
        />
        <PathField
          id="modelsDir"
          label="大模型目录"
          hint="存放 .gguf 文件，可与数据目录在不同磁盘"
          value={draft.modelsDir}
          onChange={(value) => setDraft({ ...draft, modelsDir: value })}
          onBrowse={() => pickFolder("modelsDir")}
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
  const defaultNote =
    draft.dataRoot === paths.defaultDataRoot &&
    draft.modelsDir === paths.defaultModelsDir
      ? "当前为系统默认路径"
      : "保存后生效；换目录不会自动迁移已有文件"

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">保存后将使用</p>
      <ul className="space-y-1 font-mono break-all">
        <li>数据库：{previewDb}</li>
        <li>记忆 Markdown：{previewMemories}</li>
        <li>大模型：{draft.modelsDir.replace(/\\/g, "/")}/</li>
      </ul>
      <p className="mt-2">{defaultNote}</p>
    </div>
  )
}

function RuntimeSection({
  metrics,
  modelReady,
  currentModel,
  runtimeDraft,
  setRuntimeDraft,
  onSave,
}: {
  metrics?: {
    cpuCount: number
    availableMemoryGb: number
    totalMemoryGb: number
    pressure: string
  }
  modelReady?: boolean
  currentModel?: string | null
  runtimeDraft: RuntimeSettings | null
  setRuntimeDraft: (settings: RuntimeSettings) => void
  onSave: ReturnType<
    typeof useMutation<RuntimeSettings, Error, RuntimeSettings>
  >
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          运行时
        </h2>
      </div>

      {metrics && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-2xl bg-card/60 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">CPU: {metrics.cpuCount} 核</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              内存: {metrics.availableMemoryGb.toFixed(1)} /{" "}
              {metrics.totalMemoryGb.toFixed(1)} GB
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                metrics.pressure === "low"
                  ? "bg-green-500"
                  : metrics.pressure === "medium"
                    ? "bg-amber-500"
                    : "bg-red-500"
              )}
            />
            <span className="text-sm">
              {metrics.pressure === "low"
                ? "轻松"
                : metrics.pressure === "medium"
                  ? "中等"
                  : "高"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                modelReady ? "bg-green-500" : "bg-gray-400"
              )}
            />
            <span className="text-sm">
              {modelReady ? `模型: ${currentModel || "已加载"}` : "模型未加载"}
            </span>
          </div>
        </div>
      )}

      {runtimeDraft && (
        <form className="space-y-4 rounded-2xl bg-card/60 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="maxCpuPercent">最大 CPU 使用率</Label>
              <Input
                id="maxCpuPercent"
                type="number"
                value={runtimeDraft.maxCpuPercent}
                onChange={(e) =>
                  setRuntimeDraft({
                    ...runtimeDraft,
                    maxCpuPercent: Number(e.target.value),
                  })
                }
                className="bg-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="preferLowPower"
              checked={runtimeDraft.preferLowPower}
              onChange={(e) =>
                setRuntimeDraft({
                  ...runtimeDraft,
                  preferLowPower: e.target.checked,
                })
              }
              className="size-4 rounded"
            />
            <Label htmlFor="preferLowPower">
              优先低功耗（全 CPU）；关闭时按显存自动分配 GPU 层（类似 Ollama）
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={onSave.isPending}
            onClick={() => onSave.mutate(runtimeDraft)}
          >
            {onSave.isPending ? "保存中..." : "保存运行时"}
          </Button>
        </form>
      )}
    </section>
  )
}
