import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CheckCircle2, Download, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { SectionHeading } from "~/components/section-heading"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Progress } from "~/components/ui/progress"
import { Textarea } from "~/components/ui/textarea"
import {
  getModelDownloadTasks,
  getAccountProfile,
  getModelDownloadOptions,
  getModelDownloadSuites,
  getRuntimeMetrics,
  getRuntimeSettings,
  saveRuntimeSettings,
  saveAccountProfile,
  startModelDownload,
  startModelSuiteDownload,
  type ModelConfig,
  type ModelDownloadTask,
  type RuntimeSettings,
  type AccountProfile,
} from "~/services/workspace"
import { useAppStore } from "~/stores/app-store"

const profileSchema = z.object({
  accountName: z.string().min(1, "请输入账号名称"),
  track: z.string().min(1, "请输入赛道"),
  persona: z.string().min(10, "人设描述至少写 10 个字"),
  toneStyle: z.string().min(6, "语气风格至少写 6 个字"),
  forbiddenWords: z.string(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const setActiveAccountName = useAppStore(
    (state) => state.setActiveAccountName
  )

  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
  })
  const { data: runtimeSettings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    refetchInterval: 3000,
  })
  const { data: downloadOptions } = useQuery({
    queryKey: ["model-download-options"],
    queryFn: getModelDownloadOptions,
  })
  const { data: downloadSuites } = useQuery({
    queryKey: ["model-download-suites"],
    queryFn: getModelDownloadSuites,
  })
  const { data: downloadTasks } = useQuery({
    queryKey: ["model-download-tasks"],
    queryFn: getModelDownloadTasks,
    refetchInterval: (query) =>
      query.state.data?.some((task) => task.status === "running")
        ? 1000
        : false,
  })
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeSettings | null>(null)

  useEffect(() => {
    if (runtimeSettings) setRuntimeDraft(runtimeSettings)
  }, [runtimeSettings])

  const saveProfileMutation = useMutation({
    mutationFn: saveAccountProfile,
    onSuccess: (nextProfile) => {
      queryClient.setQueryData(["account-profile"], nextProfile)
      setActiveAccountName(nextProfile.accountName)
    },
  })
  const saveRuntimeMutation = useMutation({
    mutationFn: saveRuntimeSettings,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["runtime-settings"], nextSettings)
      setRuntimeDraft(nextSettings)
    },
  })
  const startDownloadMutation = useMutation({
    mutationFn: startModelDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-download-tasks"] })
    },
  })
  const startSuiteDownloadMutation = useMutation({
    mutationFn: startModelSuiteDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-download-tasks"] })
    },
  })

  useEffect(() => {
    if (!downloadTasks?.some((task) => task.status === "done")) return
    queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
    queryClient.invalidateQueries({ queryKey: ["runtime-metrics"] })
  }, [downloadTasks, queryClient])

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: profile ?? emptyProfile(),
  })

  const onSubmit = (values: ProfileFormValues) => {
    saveProfileMutation.mutate(values)
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="设置"
        title="账号与记忆配置"
        description="仅保留账号记忆配置。模型调用由 Bun + node-llama-cpp 在创作页直接执行。"
      />

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>账号创作配置</CardTitle>
          <CardDescription>保存后会写入本地配置文件。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <Field
              label="账号名称"
              error={form.formState.errors.accountName?.message}
            >
              <Input {...form.register("accountName")} />
            </Field>

            <Field label="赛道" error={form.formState.errors.track?.message}>
              <Input {...form.register("track")} />
            </Field>

            <Field
              label="人设描述"
              error={form.formState.errors.persona?.message}
            >
              <Textarea {...form.register("persona")} />
            </Field>

            <Field
              label="语气风格"
              error={form.formState.errors.toneStyle?.message}
            >
              <Textarea {...form.register("toneStyle")} />
            </Field>

            <Field label="禁忌词">
              <Textarea
                {...form.register("forbiddenWords")}
                placeholder="用逗号分隔，例如：绝对有效, 全网第一"
              />
            </Field>

            {saveProfileMutation.error instanceof Error ? (
              <p className="text-sm text-destructive">
                {saveProfileMutation.error.message}
              </p>
            ) : null}

            <Button type="submit" disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? "保存中" : "保存配置"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>端侧模型与性能调度</CardTitle>
          <CardDescription>
            登记已下载的 GGUF 模型后，创作页会根据 CPU、内存和负载自动选择。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <RuntimeStat
              label="CPU"
              value={`${metrics?.cpuUsagePercent.toFixed(0) ?? "--"}%`}
            />
            <RuntimeStat
              label="可用内存"
              value={`${metrics?.availableMemoryGb.toFixed(1) ?? "--"} GB`}
            />
            <RuntimeStat label="压力" value={metrics?.pressure ?? "--"} />
          </div>

          {runtimeDraft ? (
            <div className="space-y-4">
              <Field label="Hugging Face 镜像地址">
                <Input
                  value={runtimeDraft.hfEndpoint}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeDraft,
                      hfEndpoint: event.target.value,
                    })
                  }
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="CPU 上限">
                  <Input
                    type="number"
                    min={30}
                    max={95}
                    value={runtimeDraft.maxCpuPercent}
                    onChange={(event) =>
                      setRuntimeDraft({
                        ...runtimeDraft,
                        maxCpuPercent: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <label className="flex items-center gap-2 pt-7 text-sm">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.preferLowPower}
                    onChange={(event) =>
                      setRuntimeDraft({
                        ...runtimeDraft,
                        preferLowPower: event.target.checked,
                      })
                    }
                  />
                  优先低功耗，避免 7B 占满笔记本
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">已下载模型</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      setRuntimeDraft({
                        ...runtimeDraft,
                        models: [...runtimeDraft.models, emptyModel()],
                      })
                    }
                  >
                    <Plus className="size-4" />
                    添加
                  </Button>
                </div>

                {runtimeDraft.models.map((model, index) => (
                  <ModelRow
                    key={`${model.id}-${index}`}
                    model={model}
                    onChange={(nextModel) => {
                      const models = [...runtimeDraft.models]
                      models[index] = nextModel
                      setRuntimeDraft({ ...runtimeDraft, models })
                    }}
                    onRemove={() =>
                      setRuntimeDraft({
                        ...runtimeDraft,
                        models: runtimeDraft.models.filter(
                          (_, itemIndex) => itemIndex !== index
                        ),
                      })
                    }
                  />
                ))}
              </div>

              {saveRuntimeMutation.error instanceof Error ? (
                <p className="text-sm text-destructive">
                  {saveRuntimeMutation.error.message}
                </p>
              ) : null}

              <Button
                type="button"
                disabled={saveRuntimeMutation.isPending}
                onClick={() => saveRuntimeMutation.mutate(runtimeDraft)}
              >
                {saveRuntimeMutation.isPending ? "保存中" : "保存模型设置"}
              </Button>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium">推荐模型套装</p>
            <div className="grid gap-3">
              {(downloadSuites ?? []).map((suite) => (
                <div
                  key={suite.id}
                  className="rounded-lg border border-border/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{suite.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {suite.note}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {suite.models.join(" / ")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={startSuiteDownloadMutation.isPending}
                      onClick={() =>
                        startSuiteDownloadMutation.mutate(suite.id)
                      }
                    >
                      <Download className="size-4" />
                      下载套装
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium">推荐下载选项</p>
            <DownloadAlerts tasks={downloadTasks ?? []} />
            <div className="grid gap-3">
              {(downloadOptions ?? []).map((option) => (
                <div
                  key={option.id}
                  className="rounded-lg border border-border/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.sizeGb} GB · {option.quant} ·{" "}
                        {capabilityLabel(option.capability)} ·{" "}
                        {option.note}
                      </p>
                    </div>
                    <DownloadButton
                      optionId={option.id}
                      tasks={downloadTasks ?? []}
                      disabled={startDownloadMutation.isPending}
                      onDownload={() => startDownloadMutation.mutate(option.id)}
                    />
                  </div>
                  <DownloadProgress
                    task={(downloadTasks ?? []).find(
                      (task) => task.optionId === option.id
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DownloadButton({
  optionId,
  tasks,
  disabled,
  onDownload,
}: {
  optionId: string
  tasks: ModelDownloadTask[]
  disabled: boolean
  onDownload: () => void
}) {
  const task = tasks.find((item) => item.optionId === optionId)
  const running = task?.status === "running"
  const done = task?.status === "done"

  return (
    <Button
      type="button"
      variant={done ? "secondary" : "outline"}
      className="gap-2"
      disabled={disabled || running || done}
      onClick={onDownload}
    >
      {done ? (
        <CheckCircle2 className="size-4" />
      ) : (
        <Download className="size-4" />
      )}
      {running ? "下载中" : done ? "已下载" : "下载"}
    </Button>
  )
}

function DownloadProgress({ task }: { task?: ModelDownloadTask }) {
  if (!task) return null

  return (
    <div className="mt-3 space-y-2">
      <Progress value={task.progress} />
      <p className="text-xs text-muted-foreground">
        {task.status === "running"
          ? `${task.progress.toFixed(1)}% · ${formatBytes(task.downloadedBytes)} / ${
              task.totalBytes ? formatBytes(task.totalBytes) : "未知大小"
            }`
          : task.status === "done"
            ? `已保存到 ${task.targetPath}`
            : task.errorMessage}
      </p>
    </div>
  )
}

function DownloadAlerts({ tasks }: { tasks: ModelDownloadTask[] }) {
  const latest = [...tasks]
    .reverse()
    .find((task) => task.status === "done" || task.status === "failed")
  if (!latest) return null

  const failed = latest.status === "failed"
  return (
    <Alert variant={failed ? "destructive" : "default"}>
      {failed ? (
        <AlertCircle className="size-4" />
      ) : (
        <CheckCircle2 className="size-4" />
      )}
      <AlertTitle>{failed ? "模型下载失败" : "模型下载完成"}</AlertTitle>
      <AlertDescription>
        {failed
          ? latest.errorMessage
          : `${latest.label} 已保存并登记到本地模型列表。`}
      </AlertDescription>
    </Alert>
  )
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(value / 1024)} KB`
}

function capabilityLabel(capability: ModelConfig["capability"]) {
  if (capability === "vision") return "视觉"
  if (capability === "embedding") return "语义向量"
  return "文本"
}

function emptyProfile(): AccountProfile {
  return {
    accountName: "",
    track: "",
    persona: "",
    toneStyle: "",
    forbiddenWords: "",
  }
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function emptyModel(): ModelConfig {
  return {
    id: `model-${Date.now()}`,
    label: "",
    path: "",
    paramsB: 3,
    quant: "Q4_K_M",
    sizeGb: 2.2,
    enabled: true,
    capability: "text",
  }
}

function ModelRow({
  model,
  onChange,
  onRemove,
}: {
  model: ModelConfig
  onChange: (model: ModelConfig) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/70 p-3 md:grid-cols-[1fr_1fr_90px_90px_110px_auto]">
      <Input
        placeholder="Qwen2.5 3B Q4"
        value={model.label}
        onChange={(event) => onChange({ ...model, label: event.target.value })}
      />
      <Input
        placeholder="D:\\models\\xxx.gguf"
        value={model.path}
        onChange={(event) => onChange({ ...model, path: event.target.value })}
      />
      <Input
        type="number"
        step="0.5"
        value={model.paramsB}
        onChange={(event) =>
          onChange({ ...model, paramsB: Number(event.target.value) })
        }
      />
      <Input
        value={model.quant}
        onChange={(event) => onChange({ ...model, quant: event.target.value })}
      />
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={model.capability ?? "text"}
        onChange={(event) =>
          onChange({
            ...model,
            capability: event.target.value as ModelConfig["capability"],
          })
        }
      >
        <option value="text">文本</option>
        <option value="vision">视觉</option>
        <option value="embedding">语义向量</option>
      </select>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={model.enabled}
          onChange={(event) =>
            onChange({ ...model, enabled: event.target.checked })
          }
        />
        <Button type="button" variant="outline" size="icon" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </label>
  )
}
