import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cloud, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createChatModelEntry,
  entryDisplayName,
  enforceChatModelRules,
  resolveEntryApiBase,
  resolveEntryApiKey,
  type ChatModelEntry,
} from "~/config/chat-models"
import { getCodingPlanVendor, isDashScopeOpenAiBaseUrl, resolveCatalogBaseUrl } from "~/config/llm-presets"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { useCodingPlanCatalog } from "~/hooks/use-coding-plan-catalog"
import { listOpenAiModels } from "~/services/electron-client"
import { cn } from "~/lib/utils"
import type { LlmProviderConfig } from "~/services/llm-provider"
import { loadModelRegistry, saveChatModels } from "~/services/model-registry"

function globalApiFromRegistry(registry: Awaited<ReturnType<typeof loadModelRegistry>>): LlmProviderConfig {
  return {
    preset: registry.apiPreset,
    baseUrl: registry.apiBaseUrl,
    apiKey: registry.apiKey,
    model: registry.apiModel,
  }
}

export function ModelListPanel() {
  const queryClient = useQueryClient()
  const { vendors } = useCodingPlanCatalog()
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({})
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const { data: registry, isLoading } = useQuery({
    queryKey: ["model-registry"],
    queryFn: loadModelRegistry,
  })

  const [models, setModels] = useState<ChatModelEntry[]>([])
  const [activeChatModelId, setActiveChatModelId] = useState("")

  useEffect(() => {
    if (!registry) return
    setModels(enforceChatModelRules(registry.chatModels))
    setActiveChatModelId(registry.activeChatModelId)
  }, [registry])

  const apiModels = models

  const setActiveModel = (id: string) => {
    setActiveChatModelId(id)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      saveChatModels(models, {
        activeChatModelId,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["runtime-settings"], next)
      void queryClient.invalidateQueries({ queryKey: ["model-registry"] })
      toast.success("已保存")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  })

  const setModelsSafe = (next: ChatModelEntry[]) => {
    setModels(enforceChatModelRules(next))
  }

  const addApiModel = () => {
    const entry = createChatModelEntry({
      label: "",
      tier: "balanced",
      model: "",
      preset: "custom",
      baseUrl: "",
      apiKey: "",
    })
    setModelsSafe([...models, entry])
    if (!activeChatModelId) setActiveModel(entry.id)
  }

  const fetchModelsForEntry = async (entry: ChatModelEntry) => {
    if (!registry) {
      toast.error("配置尚未加载")
      return
    }
    const globalApi = globalApiFromRegistry(registry)
    setFetchingId(entry.id)
    try {
      const base = resolveEntryApiBase(entry, globalApi)
      const apiKey = resolveEntryApiKey(entry, globalApi)
      const result = await listOpenAiModels({
        baseUrl: base,
        apiKey,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setFetchedModels((prev) => ({ ...prev, [entry.id]: result.models }))
      toast.success(
        isDashScopeOpenAiBaseUrl(base)
          ? `已加载 ${result.models.length} 个百炼常用模型（官方无列表接口，请按文档手填其它模型名）`
          : `已拉取 ${result.models.length} 个模型`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "拉取失败")
    } finally {
      setFetchingId(null)
    }
  }

  const updateApi = (id: string, patch: Partial<ChatModelEntry>) => {
    setModelsSafe(models.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const applyApiPreset = (id: string, preset: string) => {
    const entry = apiModels.find((m) => m.id === id)
    if (!entry) return
    const base = resolveCatalogBaseUrl(preset, entry.baseUrl ?? "")
    updateApi(id, {
      preset,
      baseUrl: preset === "custom" ? entry.baseUrl ?? "" : base,
      label: getCodingPlanVendor(preset)?.label ?? entry.label,
    })
  }

  const removeApi = (id: string) => {
    setModelsSafe(models.filter((m) => m.id !== id))
  }

  if (isLoading) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        套餐目录来自仓库静态表 + 可选「更新目录」从{" "}
        <span className="font-mono text-[10px]">coding-plans-for-copilot</span>{" "}
        拉取，仅用于填充 <strong className="text-foreground">Base URL</strong>；
        <strong className="text-foreground">模型名</strong>以你填写或「从接口拉取」为准（目录里的
        modelHints 只是示例，可能过时）。在已启用的条目中指定一个「当前对话模型」即可。
      </p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud className="size-4 text-primary" />
            <h3 className="text-sm font-medium">Coding Plan / API</h3>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={addApiModel}
          >
            <Plus className="size-4" />
            添加
          </Button>
        </div>

        {apiModels.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
            添加 API 配置并填写 Key 与模型名后即可开始对话
          </p>
        ) : (
          <ul className="space-y-3">
            {apiModels.map((entry) => {
              const vendor = getCodingPlanVendor(entry.preset ?? "custom")
              const hints = vendor?.modelHints ?? []
              const remoteList = fetchedModels[entry.id] ?? []
              const suggestId = `model-suggest-${entry.id}`
              const preset = entry.preset ?? "custom"
              const resolvedBase = resolveCatalogBaseUrl(preset, entry.baseUrl ?? "")
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-opacity",
                    !entry.enabled && "opacity-60"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {entryDisplayName(entry)}
                      {!entry.enabled ? (
                        <span className="ml-1.5 text-foreground/70">（已关闭）</span>
                      ) : null}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Label
                        htmlFor={`api-enabled-${entry.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        启用
                      </Label>
                      <Switch
                        id={`api-enabled-${entry.id}`}
                        checked={entry.enabled}
                        onCheckedChange={(on) =>
                          updateApi(entry.id, { enabled: on })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => removeApi(entry.id)}
                        aria-label="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "grid gap-2 sm:grid-cols-2",
                      !entry.enabled && "pointer-events-none"
                    )}
                  >
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">套餐</Label>
                      <Select
                        value={preset}
                        onValueChange={(v) => applyApiPreset(entry.id, v)}
                      >
                        <SelectTrigger className="h-9 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">自定义 OpenAI 兼容</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Base URL</Label>
                      <Input
                        className="h-9 font-mono text-xs"
                        value={preset === "custom" ? entry.baseUrl ?? "" : resolvedBase}
                        disabled={preset !== "custom"}
                        onChange={(e) =>
                          updateApi(entry.id, { baseUrl: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">API Key</Label>
                      <Input
                        type="password"
                        className="h-9 font-mono text-xs"
                        value={entry.apiKey ?? ""}
                        onChange={(e) =>
                          updateApi(entry.id, { apiKey: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">模型名（厂商文档为准）</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={fetchingId === entry.id}
                          onClick={() => void fetchModelsForEntry(entry)}
                        >
                          {fetchingId === entry.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : null}
                          从接口拉取
                        </Button>
                      </div>
                      <Input
                        list={suggestId}
                        className="h-9 font-mono text-xs"
                        value={entry.model}
                        placeholder={hints[0] ? `示例：${hints[0]}` : "GLM-4.7"}
                        onChange={(e) =>
                          updateApi(entry.id, { model: e.target.value })
                        }
                      />
                      <datalist id={suggestId}>
                        {[...new Set([...remoteList, ...hints])].map((id) => (
                          <option key={id} value={id} />
                        ))}
                      </datalist>
                    </div>
                    <div className="sm:col-span-2">
                      <ActiveModelButton
                        entryId={entry.id}
                        activeId={activeChatModelId}
                        disabled={!entry.enabled}
                        onSelect={setActiveModel}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Button
        type="button"
        className="h-11 w-full rounded-2xl"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "保存中…" : "保存模型方案"}
      </Button>
    </div>
  )
}

function ActiveModelButton({
  entryId,
  activeId,
  disabled,
  onSelect,
}: {
  entryId: string
  activeId: string
  disabled?: boolean
  onSelect: (id: string) => void
}) {
  const isActive = activeId === entryId
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="sm"
      className="h-8 rounded-xl text-xs"
      disabled={disabled}
      onClick={() => onSelect(entryId)}
    >
      {isActive ? "当前对话模型" : "设为对话模型"}
    </Button>
  )
}
