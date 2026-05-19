import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Download, Loader2, Sparkles, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Progress } from "~/components/ui/progress"
import {
  deleteModel,
  downloadModel,
  getModelCatalog,
  onModelDownloadProgress,
  type ModelCatalogItem,
} from "~/services/electron-client"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
import { getCurrentModel, getLoadingState, loadModel, subscribeLoadingState } from "~/services/llm"

const LAST_MODEL_KEY = "neezy-llm-last-model"

async function saveLastUsedModel(modelFileName: string): Promise<void> {
  localStorage.setItem(LAST_MODEL_KEY, modelFileName)
  try {
    const settings = await getRuntimeSettings()
    await saveRuntimeSettings({ ...settings, llmModel: modelFileName })
  } catch {
    // localStorage is enough as a fallback.
  }
}

function modelTone(item: ModelCatalogItem, memoryGb?: number) {
  if (item.installed) return "已准备好"
  if (memoryGb && memoryGb < item.minMemoryGb) return "这台电脑可能会比较吃力"
  if (item.minMemoryGb <= 8) return "推荐先试这个"
  if (item.minMemoryGb <= 12) return "体验更稳"
  return "适合更复杂的任务"
}

export function LlmModelBrowser({ memoryGb }: { memoryGb?: number }) {
  const [items, setItems] = useState<ModelCatalogItem[]>([])
  const [currentModel, setCurrentModel] = useState<string | null>(getCurrentModel())
  const [loadingState, setLoadingState] = useState(getLoadingState())
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      setItems(await getModelCatalog())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "暂时无法读取模型列表")
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsubscribeLoading = subscribeLoadingState(setLoadingState)
    const unsubscribeDownload = onModelDownloadProgress((next) => {
      setItems((current) => current.map((item) => item.id === next.id ? next : item))
    })
    return () => {
      unsubscribeLoading()
      unsubscribeDownload()
    }
  }, [refresh])

  useEffect(() => {
    if (currentModel || items.length === 0) return
    const saved = localStorage.getItem(LAST_MODEL_KEY)
    const candidate = items.find((item) => item.installed && (item.fileName === saved || !saved))
    if (!candidate) return

    loadModel(candidate.fileName)
      .then(() => setCurrentModel(candidate.fileName))
      .catch((error) => console.warn("[LLM] Auto-load failed:", error))
  }, [items, currentModel])

  const recommendedId = useMemo(() => {
    const available = items.filter((item) => !memoryGb || memoryGb >= item.minMemoryGb)
    return (available[1] ?? available[0] ?? items[0])?.id
  }, [items, memoryGb])

  const handleDownload = useCallback(async (modelId: string) => {
    try {
      await downloadModel(modelId)
      await refresh()
      toast.success("下载完成，可以开始使用了")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下载失败，请稍后重试")
    }
  }, [refresh])

  const handleUse = useCallback(async (item: ModelCatalogItem) => {
    try {
      await loadModel(item.fileName)
      await saveLastUsedModel(item.fileName)
      setCurrentModel(item.fileName)
      toast.success(`已切换到 ${item.title}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换失败")
    }
  }, [])

  const handleDelete = useCallback(async (modelId: string) => {
    try {
      await deleteModel(modelId)
      await refresh()
      toast.success("已移除本地模型")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除失败")
    }
  }, [refresh])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 className="font-display text-xl font-semibold tracking-tight">选择你的本地助手</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">选一个合适的能力包，下载后就能离线使用。</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl" onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          刷新
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const isCurrent = currentModel === item.fileName
          const isLoading = loadingState.isLoading && loadingState.loadingModelId === item.fileName
          const isDownloading = item.status === "downloading"
          const progress = item.progress ?? 0

          return (
            <Card key={item.id} className="rounded-2xl bg-card/70">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {item.title}
                      {item.id === recommendedId && <Badge variant="secondary">适合你</Badge>}
                    </CardTitle>
                    <CardDescription>{item.subtitle}</CardDescription>
                  </div>
                  {isCurrent && <CheckCircle2 className="size-5 text-emerald-500" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {item.fit.map((fit) => (
                    <Badge key={fit} variant="outline">{fit}</Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{modelTone(item, memoryGb)}</span>
                  <span className="font-medium">{item.sizeLabel}</span>
                </div>

                {isDownloading && (
                  <div className="space-y-2">
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground">正在下载 {progress || 0}%</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {item.installed ? (
                    <>
                      <Button
                        type="button"
                        className="flex-1 rounded-xl"
                        disabled={isCurrent || loadingState.isLoading}
                        onClick={() => handleUse(item)}
                      >
                        {isLoading ? "准备中..." : isCurrent ? "使用中" : "使用"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-xl text-muted-foreground"
                        onClick={() => handleDelete(item.id)}
                        disabled={isCurrent || loadingState.isLoading}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      className="w-full gap-2 rounded-xl"
                      onClick={() => handleDownload(item.id)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                      {isDownloading ? "下载中" : "下载"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
