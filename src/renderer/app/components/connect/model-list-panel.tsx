import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cloud, Cpu, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import { MODEL_TIER_META, MODEL_TIERS } from "~/config/model-tiers"
import {
  createChatModelEntry,
  entryDisplayName,
  enforceChatModelRules,
  findOllamaChatEntry,
  type ChatModelEntry,
} from "~/config/chat-models"
import { getCodingPlanVendor, resolveCatalogBaseUrl } from "~/config/llm-presets"
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
import {
  getModelCatalog,
  getOllamaStatus,
  listOpenAiModels,
} from "~/services/electron-client"
import { cn } from "~/lib/utils"
import { loadModelRegistry, saveChatModels } from "~/services/model-registry"
import type { ChatTierMode, ModelTier } from "~/services/settings"

export function ModelListPanel() {
  const queryClient = useQueryClient()
  const { vendors, refreshFromUpstream, isRefreshing } = useCodingPlanCatalog()
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({})
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const { data: registry, isLoading } = useQuery({
    queryKey: ["model-registry"],
    queryFn: loadModelRegistry,
  })
  const { data: ollamaStatus } = useQuery({
    queryKey: ["ollama-status"],
    queryFn: getOllamaStatus,
    refetchInterval: 15_000,
  })
  const { data: chatCatalog = [] } = useQuery({
    queryKey: ["model-catalog", "chat", "installed"],
    queryFn: () => getModelCatalog("chat"),
    enabled: ollamaStatus?.connected === true,
  })

  const installedOllama = useMemo(
    () => chatCatalog.filter((m) => m.installed && m.kind === "chat"),
    [chatCatalog]
  )

  const [models, setModels] = useState<ChatModelEntry[]>([])
  const [tierMode, setTierMode] = useState<ChatTierMode>("auto")
  const [fixedTier, setFixedTier] = useState<ModelTier>("balanced")
  const [ollamaHost, setOllamaHost] = useState("http://127.0.0.1:11434")

  useEffect(() => {
    if (!registry) return
    setModels(enforceChatModelRules(registry.chatModels))
    setTierMode(registry.chatTierMode)
    setFixedTier(registry.activeTier || "balanced")
    setOllamaHost(registry.ollamaHost)
  }, [registry])

  const ollamaEntry = findOllamaChatEntry(models)
  const apiModels = models.filter((m) => m.transport === "openai-compatible")

  const saveMutation = useMutation({
    mutationFn: () =>
      saveChatModels(models, {
        chatTierMode: tierMode,
        activeTier: tierMode === "fixed" ? fixedTier : "",
        ollamaHost: ollamaHost.trim(),
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

  const upsertOllama = (patch: Partial<ChatModelEntry> & { model: string }) => {
    const base = ollamaEntry ?? createChatModelEntry({
      label: "",
      tier: "balanced",
      transport: "ollama",
      model: "",
    })
    const next = models.filter((m) => m.transport !== "ollama")
    setModelsSafe([
      ...next,
      {
        ...base,
        ...patch,
        transport: "ollama",
        enabled: patch.enabled ?? true,
      },
    ])
  }

  const addApiModel = () => {
    setModelsSafe([
      ...models,
      createChatModelEntry({
        label: "",
        tier: "balanced",
        transport: "openai-compatible",
        model: "",
        preset: "custom",
        baseUrl: "",
        apiKey: "",
      }),
    ])
  }

  const fetchModelsForEntry = async (entry: ChatModelEntry) => {
    setFetchingId(entry.id)
    try {
      const base = resolveCatalogBaseUrl(
        entry.preset ?? "custom",
        entry.baseUrl ?? ""
      )
      const result = await listOpenAiModels({
        baseUrl: base,
        apiKey: entry.apiKey ?? "",
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setFetchedModels((prev) => ({ ...prev, [entry.id]: result.models }))
      toast.success(`已拉取 ${result.models.length} 个模型`)
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
        modelHints 只是示例，可能过时）。
        本机 Ollama 同时只保留一个对话模型。各 API / Ollama 条目可单独启用或关闭，关闭后不参与档位路由。
      </p>

      <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/15 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <h3 className="text-sm font-medium">本机 Ollama</h3>
          </div>
          {ollamaEntry ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="ollama-enabled" className="text-xs text-muted-foreground">
                启用
              </Label>
              <Switch
                id="ollama-enabled"
                checked={ollamaEntry.enabled}
                onCheckedChange={(on) =>
                  upsertOllama({ model: ollamaEntry.model, enabled: on })
                }
              />
            </div>
          ) : null}
        </div>

        {ollamaStatus?.connected !== true ? (
          <p className="text-xs text-muted-foreground">
            Ollama 未连接。请在下方折叠区填写地址，或到{" "}
            <Link to="/models" className="text-primary hover:underline">
              本地模型
            </Link>{" "}
            拉取模型。
          </p>
        ) : installedOllama.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            暂无已安装的对话模型，请先到{" "}
            <Link to="/models" className="text-primary hover:underline">
              本地模型
            </Link>{" "}
            pull。
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">已安装模型</Label>
              <Select
                value={ollamaEntry?.model || ""}
                onValueChange={(name) =>
                  upsertOllama({
                    model: name,
                    label: installedOllama.find((m) => m.fileName === name)?.title ?? name,
                    tier: ollamaEntry?.tier ?? "balanced",
                    enabled: true,
                  })
                }
              >
                <SelectTrigger className="h-9 rounded-xl font-mono text-xs">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {installedOllama.map((m) => (
                    <SelectItem key={m.id} value={m.fileName} className="font-mono text-xs">
                      {m.title || m.fileName}
                      <span className="ml-2 text-muted-foreground">{m.sizeLabel}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ollamaEntry?.model ? (
              <div className="space-y-1">
                <Label className="text-xs">档位</Label>
                <Select
                  value={ollamaEntry.tier}
                  onValueChange={(v) =>
                    upsertOllama({ model: ollamaEntry.model, tier: v as ModelTier })
                  }
                >
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {MODEL_TIER_META[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud className="size-4 text-primary" />
            <h3 className="text-sm font-medium">Coding Plan</h3>
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

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">选档</Label>
            <Select
              value={tierMode}
              onValueChange={(v) => setTierMode(v as ChatTierMode)}
            >
              <SelectTrigger className="h-9 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动（按任务）</SelectItem>
                <SelectItem value="fixed">固定档位</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tierMode === "fixed" ? (
            <div className="space-y-1">
              <Label className="text-xs">固定档位</Label>
              <Select
                value={fixedTier}
                onValueChange={(v) => setFixedTier(v as ModelTier)}
              >
                <SelectTrigger className="h-9 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MODEL_TIER_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {apiModels.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
            可添加多条（不同套餐 / 档位）
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
                    <div className="space-y-1">
                      <Label className="text-xs">档位</Label>
                      <Select
                        value={entry.tier}
                        onValueChange={(v) =>
                          updateApi(entry.id, { tier: v as ModelTier })
                        }
                      >
                        <SelectTrigger className="h-9 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODEL_TIERS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {MODEL_TIER_META[t].label}
                            </SelectItem>
                          ))}
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
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 p-3">
        <Label className="text-xs">Ollama 地址（仅在使用本机 Ollama 对话时需要）</Label>
        <Input
          value={ollamaHost}
          onChange={(e) => setOllamaHost(e.target.value)}
          className="h-9 font-mono text-xs"
          placeholder="http://127.0.0.1:11434"
        />
      </div>

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
