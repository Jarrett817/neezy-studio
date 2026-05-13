import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Settings2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { SectionHeading } from "~/components/section-heading"
import { WebLLMModelBrowser } from "~/components/webllm-model-browser"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"
import {
  getAccountProfile,
  getRuntimeMetrics,
  getRuntimeSettings,
  saveRuntimeSettings,
  saveAccountProfile,
  type AccountProfile,
} from "~/services/workspace"
import { type RuntimeSettings } from "~/services/settings"
import { useAppStore } from "~/stores/app-store"
import { isModelLoaded, getCurrentModel } from "~/services/webllm"

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
  const setActiveAccountName = useAppStore((state) => state.setActiveAccountName)

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
    staleTime: 5000,
  })
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeSettings | null>(null)

  // WebLLM 模型状态
  const modelLoaded = isModelLoaded()
  const currentModel = getCurrentModel()

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

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: profile ?? emptyProfile(),
  })
  const onSubmit = (values: ProfileFormValues) => saveProfileMutation.mutate(values)

  return (
    <div className="space-y-8 pt-4">
      <AccountSection form={form} onSubmit={onSubmit} isPending={saveProfileMutation.isPending} />
      <RuntimeSection metrics={metrics} modelReady={modelLoaded} currentModel={currentModel} runtimeDraft={runtimeDraft} setRuntimeDraft={setRuntimeDraft} onSave={saveRuntimeMutation} />
      <WebLLMModelBrowser />
    </div>
  )
}

function AccountSection({ form, onSubmit, isPending }: {
  form: ReturnType<typeof useForm<ProfileFormValues>>
  onSubmit: (values: ProfileFormValues) => void
  isPending: boolean
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">账号配置</h1>
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="accountName">账号名称</Label>
            <Input id="accountName" {...form.register("accountName")} className="bg-card/60" placeholder="例如：小红书运营小明" />
            {form.formState.errors.accountName && (
              <p className="text-xs text-destructive">{form.formState.errors.accountName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="track">赛道</Label>
            <Input id="track" {...form.register("track")} className="bg-card/60" placeholder="例如：美妆护肤" />
            {form.formState.errors.track && (
              <p className="text-xs text-destructive">{form.formState.errors.track.message}</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="persona">人设描述</Label>
          <Textarea id="persona" {...form.register("persona")} className="min-h-20 resize-none bg-card/60" placeholder="我是专注职场成长的 90 后运营..." />
          {form.formState.errors.persona && (
            <p className="text-xs text-destructive">{form.formState.errors.persona.message}</p>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="toneStyle">语气风格</Label>
            <Input id="toneStyle" {...form.register("toneStyle")} className="bg-card/60" placeholder="温暖亲切、专业靠谱..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="forbiddenWords">禁用词</Label>
            <Textarea id="forbiddenWords" {...form.register("forbiddenWords")} className="min-h-16 resize-none bg-card/60" placeholder="推广、联系我、点击下方..." />
          </div>
        </div>
        <Button type="submit" className="gap-2 btn-warm rounded-xl" disabled={isPending}>
          {isPending ? "保存中..." : "保存配置"}
        </Button>
      </form>
    </section>
  )
}

function RuntimeSection({ metrics, modelReady, currentModel, runtimeDraft, setRuntimeDraft, onSave }: {
  metrics?: { cpuCount: number; availableMemoryGb: number; totalMemoryGb: number; pressure: string }
  modelReady?: boolean
  currentModel?: string | null
  runtimeDraft: RuntimeSettings | null
  setRuntimeDraft: (settings: RuntimeSettings) => void
  onSave: ReturnType<typeof useMutation<RuntimeSettings, Error, RuntimeSettings>>
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">运行时</h1>
      </div>

      {metrics && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-2xl bg-card/60 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">CPU: {metrics.cpuCount} 核</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">内存: {metrics.availableMemoryGb.toFixed(1)} / {metrics.totalMemoryGb.toFixed(1)} GB</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", metrics.pressure === "low" ? "bg-green-500" : metrics.pressure === "medium" ? "bg-amber-500" : "bg-red-500")} />
            <span className="text-sm">{metrics.pressure === "low" ? "轻松" : metrics.pressure === "medium" ? "中等" : "高"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", modelReady ? "bg-green-500" : "bg-gray-400")} />
            <span className="text-sm">{modelReady ? `模型: ${currentModel || "已加载"}` : "模型未加载"}</span>
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
                onChange={(e) => setRuntimeDraft({ ...runtimeDraft, maxCpuPercent: Number(e.target.value) })}
                className="bg-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="preferLowPower"
              checked={runtimeDraft.preferLowPower}
              onChange={(e) => setRuntimeDraft({ ...runtimeDraft, preferLowPower: e.target.checked })}
              className="size-4 rounded"
            />
            <Label htmlFor="preferLowPower">优先低功耗模式</Label>
          </div>
          <Button type="button" variant="outline" className="gap-2 rounded-xl" disabled={onSave.isPending} onClick={() => onSave.mutate(runtimeDraft)}>
            {onSave.isPending ? "保存中..." : "保存运行时"}
          </Button>
        </form>
      )}
    </section>
  )
}

function emptyProfile(): AccountProfile {
  return { accountName: "", track: "", persona: "", toneStyle: "", forbiddenWords: "" }
}