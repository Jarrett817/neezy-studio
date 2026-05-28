import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Loader2, PlugZap, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import { Controller, useForm } from "react-hook-form"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useCodingPlanCatalog } from "~/hooks/use-coding-plan-catalog"
import {
  defaultModelForPreset,
  getCodingPlanVendor,
  resolveCatalogBaseUrl,
} from "~/config/llm-presets"
import { cn } from "~/lib/utils"
import { testLlmConnection } from "~/services/electron-client"
import { normalizeLlmProvider, type LlmProviderKind } from "~/services/llm-provider"
import {
  getRuntimeSettings,
  saveRuntimeSettings,
  type RuntimeSettings,
} from "~/services/settings"

const connectFormSchema = z
  .object({
    kind: z.enum(["ollama", "openai-compatible"]),
    preset: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    ollamaHost: z.string().min(1, "请填写 Ollama 地址"),
    embeddingModel: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.kind === "openai-compatible" && !values.model.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "请填写模型名称",
        path: ["model"],
      })
    }
  })

type ConnectFormValues = z.infer<typeof connectFormSchema>

function runtimeToForm(settings: RuntimeSettings): ConnectFormValues {
  const p = settings.llmProvider
  const chatModel =
    p.kind === "ollama" && settings.llmModel.trim()
      ? settings.llmModel
      : p.model
  return {
    kind: p.kind,
    preset: p.preset,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    model: chatModel,
    ollamaHost: settings.ollamaHost,
    embeddingModel: settings.embeddingModel,
  }
}

function formToRuntime(values: ConnectFormValues, prev: RuntimeSettings): RuntimeSettings {
  const isOllama = values.kind === "ollama"
  const llmModel = isOllama
    ? values.model.trim() || prev.llmModel
    : prev.llmModel
  const llmProvider = normalizeLlmProvider({
    kind: values.kind,
    preset: values.preset,
    baseUrl: values.baseUrl,
    apiKey: values.apiKey,
    model: isOllama ? llmModel || values.model : values.model,
  })
  return {
    ...prev,
    ollamaHost: values.ollamaHost.trim(),
    embeddingModel: values.embeddingModel.trim(),
    llmModel,
    llmProvider,
  }
}

export default function ConnectRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { vendors, refreshFromUpstream, isRefreshing } = useCodingPlanCatalog()

  const { data: runtimeSettings, isLoading } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 0,
  })

  const form = useForm<ConnectFormValues>({
    resolver: zodResolver(connectFormSchema),
    defaultValues: runtimeToForm({
      ollamaHost: "http://127.0.0.1:11434",
      embeddingModel: "",
      llmProvider: normalizeLlmProvider(null),
      preferLowPower: true,
      maxCpuPercent: 95,
      llmModel: "",
      chatTier: "",
      embeddingTier: "",
    }),
  })

  const settingsFingerprintRef = useRef("")

  useEffect(() => {
    if (!runtimeSettings) return
    const fingerprint = JSON.stringify(runtimeToForm(runtimeSettings))
    if (settingsFingerprintRef.current === fingerprint) return
    settingsFingerprintRef.current = fingerprint
    form.reset(runtimeToForm(runtimeSettings))
  }, [runtimeSettings, form])

  const kind = form.watch("kind")
  const preset = form.watch("preset")
  const isApi = kind === "openai-compatible"
  const vendor = getCodingPlanVendor(preset)
  const modelHint =
    vendor?.modelHints[0] ??
    (preset === "custom" ? "如 gpt-4o-mini" : "见厂商文档")

  const persistForm = useCallback(
    async (values: ConnectFormValues) => {
      if (!runtimeSettings) throw new Error("设置未加载")
      const next = await saveRuntimeSettings(formToRuntime(values, runtimeSettings))
      queryClient.setQueryData(["runtime-settings"], next)
      const formValues = runtimeToForm(next)
      settingsFingerprintRef.current = JSON.stringify(formValues)
      form.reset(formValues)
      return next
    },
    [runtimeSettings, queryClient, form]
  )

  const saveMutation = useMutation({
    mutationFn: persistForm,
    onSuccess: () => {
      toast.success("已保存 AI 连接")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败")
    },
  })

  const testMutation = useMutation({
    mutationFn: async (values: ConnectFormValues) => {
      await persistForm(values)
      return testLlmConnection()
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`连接成功（${result.latencyMs} ms）`)
        return
      }
      toast.error(result.error ?? "连接失败")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "测试失败")
    },
  })

  const applyPreset = (nextPreset: string) => {
    const base = resolveCatalogBaseUrl(nextPreset, form.getValues("baseUrl"))
    const model = defaultModelForPreset(nextPreset, form.getValues("model"))
    form.setValue("preset", nextPreset, { shouldDirty: true })
    if (nextPreset !== "custom") {
      form.setValue("baseUrl", base, { shouldDirty: true })
      if (model) form.setValue("model", model, { shouldDirty: true })
    }
  }

  const switchProviderKind = useCallback(
    async (nextKind: LlmProviderKind) => {
      form.setValue("kind", nextKind, { shouldDirty: true })
      if (!runtimeSettings) return
      try {
        const values = { ...form.getValues(), kind: nextKind }
        await persistForm(values)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败")
      }
    },
    [form, runtimeSettings, persistForm]
  )

  const goToLocalModels = useCallback(async () => {
    try {
      await persistForm(form.getValues())
      navigate("/models")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "请先保存连接设置")
    }
  }, [form, persistForm, navigate])

  if (isLoading || !runtimeSettings) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        加载中…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <PlugZap className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 连接</h1>
          <p className="text-sm text-muted-foreground">
            配置 Coding Plan 或本地 Ollama，供对话与场景生成使用。
          </p>
        </div>
      </div>

      <form
        className="space-y-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div>
          <p className="mb-2 text-sm font-medium">对话来源</p>
          <div className="flex gap-1 rounded-2xl border border-border/60 bg-muted/30 p-1">
            {(
              [
                ["openai-compatible", "Coding Plan / API"],
                ["ollama", "本地 Ollama"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={cn(
                  "flex-1 rounded-xl py-3 text-sm font-medium transition-colors",
                  kind === k
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/80"
                )}
                onClick={() => void switchProviderKind(k as LlmProviderKind)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isApi ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1.5">
                <Label>套餐预设</Label>
                <Controller
                  control={form.control}
                  name="preset"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value)
                        applyPreset(value)
                      }}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">自定义 OpenAI 兼容</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={isRefreshing}
                onClick={() => void refreshFromUpstream()}
              >
                {isRefreshing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                更新厂商目录
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              目录与 VS Code 扩展{" "}
              <span className="font-mono">coding-plans-for-copilot</span> 同源，无独立 npm
              包；可点击上方从 GitHub 拉取最新 vendors。
            </p>
            {vendor?.usageUrl ? (
              <p className="text-xs">
                <a
                  href={vendor.usageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  查看用量 / 配额
                </a>
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="apiBaseUrl">API Base URL</Label>
              <Input
                id="apiBaseUrl"
                {...form.register("baseUrl")}
                disabled={preset !== "custom"}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                {...form.register("apiKey")}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiModel">模型名称</Label>
              <Input
                id="apiModel"
                {...form.register("model")}
                placeholder={modelHint}
                className="font-mono text-xs"
              />
              {form.formState.errors.model ? (
                <p className="text-xs text-destructive">{form.formState.errors.model.message}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ollamaHostMain">Ollama 地址</Label>
              <Input
                id="ollamaHostMain"
                {...form.register("ollamaHost")}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-sm font-medium">在应用内下载并启动模型</p>
              <p className="mt-1 text-xs text-muted-foreground">
                无需打开 Ollama 官网或命令行，选模型 → 下载 → 启动即可创作。
              </p>
              <Button
                type="button"
                className="mt-4 h-11 w-full rounded-2xl text-base sm:w-auto sm:px-8"
                onClick={() => void goToLocalModels()}
              >
                前往本地模型
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            className="h-11 rounded-2xl px-6"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "保存中…" : "保存"}
          </Button>
          {isApi ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl px-6"
              disabled={testMutation.isPending}
              onClick={form.handleSubmit((values) => testMutation.mutate(values))}
            >
              {testMutation.isPending ? "测试中…" : "测试连接"}
            </Button>
          ) : null}
        </div>

        {isApi ? (
          <Collapsible className="rounded-2xl border border-border/60 bg-muted/20">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium">
              <span>本机 Ollama 与 Embedding（可选）</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
              <p className="text-xs text-muted-foreground">
                记忆向量检索建议使用本地 Embedding；也可保留 Ollama 地址以便切换对话来源。
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="ollamaHostFold">Ollama 地址</Label>
                <Input
                  id="ollamaHostFold"
                  {...form.register("ollamaHost")}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="embeddingModel">Embedding 模型名</Label>
                <Input
                  id="embeddingModel"
                  {...form.register("embeddingModel")}
                  placeholder="如 nomic-embed-text（需在本地模型页启动）"
                  className="font-mono text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => void goToLocalModels()}
              >
                管理本地模型
              </Button>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="embeddingModelOllama">Embedding 模型名</Label>
            <Input
              id="embeddingModelOllama"
              {...form.register("embeddingModel")}
              placeholder="记忆检索用，与对话模型分开配置"
              className="font-mono text-xs"
            />
          </div>
        )}
      </form>
    </div>
  )
}
