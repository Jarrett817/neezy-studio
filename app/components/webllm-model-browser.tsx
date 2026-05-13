// WebLLM 模型浏览器组件 - 使用 Carousel 展示模型卡片

import { useEffect, useState, useCallback } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel"
import { Button } from "~/components/ui/button"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import {
  loadModel,
  unloadModel,
  isModelLoaded,
  getCurrentModel,
  getModelList,
  subscribeLoadingState,
  type ModelProgress,
  type WebLLMModel,
} from "~/services/webllm"
import { saveRuntimeSettings } from "~/services/settings"
import { getRuntimeSettings } from "~/services/settings"

// localStorage keys
const LAST_MODEL_KEY = "neezy-webllm-last-model"

// 获取上次使用的模型（优先从 localStorage，失败时从 settings）
async function getLastUsedModel(): Promise<string | null> {
  // 先尝试 localStorage（同步，无依赖）
  const cached = localStorage.getItem(LAST_MODEL_KEY)
  if (cached) return cached

  // 备用：从 settings 获取（异步，有依赖）
  try {
    const settings = await getRuntimeSettings()
    if (settings.webllmModel) {
      localStorage.setItem(LAST_MODEL_KEY, settings.webllmModel)
      return settings.webllmModel
    }
  } catch (e) {
    // ignore
  }
  return null
}

// 保存最后使用的模型
async function saveLastUsedModel(modelId: string): Promise<void> {
  localStorage.setItem(LAST_MODEL_KEY, modelId)
  try {
    const settings = await getRuntimeSettings()
    await saveRuntimeSettings({ ...settings, webllmModel: modelId })
  } catch (e) {
    // ignore
  }
}

function ModelCard({
  model,
  isCurrentModel,
  isLoadingThis,
  isLoadingOther,
  progress,
  onLoad,
  onUnload,
  disabled,
}: {
  model: WebLLMModel
  isCurrentModel: boolean
  isLoadingThis: boolean
  isLoadingOther: boolean
  progress: ModelProgress | null
  onLoad: () => void
  onUnload: () => void
  disabled: boolean
}) {
  return (
    <div className="relative h-full min-h-[280px] rounded-2xl border bg-gradient-to-br from-card to-card/80 p-6 shadow-sm transition-all hover:shadow-md">
      {/* 模型信息 */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">{model.name}</h3>
            {model.description && (
              <p className="text-sm text-muted-foreground">{model.description}</p>
            )}
          </div>
          {isCurrentModel && (
            <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
              已加载
            </span>
          )}
          {isLoadingThis && (
            <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
              加载中
            </span>
          )}
        </div>

        <p className="font-mono text-xs text-muted-foreground/80">{model.id}</p>
      </div>

      {/* 加载进度 */}
      {isLoadingThis && progress && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{progress.text || "加载中..."}</span>
            <span className="font-medium">{Math.round((progress.progress ?? 0) * 100)}%</span>
          </div>
          <Progress value={(progress.progress ?? 0) * 100} className="h-1.5" />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="absolute bottom-6 left-6 right-6">
        {isCurrentModel ? (
          <Button
            variant="destructive"
            className="w-full"
            onClick={onUnload}
            disabled={disabled}
          >
            卸载模型
          </Button>
        ) : isLoadingOther ? (
          <Button variant="secondary" className="w-full" disabled>
            等待其他模型加载
          </Button>
        ) : isLoadingThis ? (
          <Button variant="secondary" className="w-full" disabled>
            <Loader2 className="size-4 animate-spin" />
            <span className="ml-2">加载中...</span>
          </Button>
        ) : (
          <Button
            className="w-full btn-warm"
            onClick={onLoad}
            disabled={disabled}
          >
            加载模型
          </Button>
        )}
      </div>
    </div>
  )
}

export function WebLLMModelBrowser() {
  const [loadingState, setLoadingState] = useState(() => ({
    isLoading: false,
    loadingModelId: null as string | null,
    progress: null as ModelProgress | null,
  }))
  const [models, setModels] = useState<WebLLMModel[]>([])
  const [currentModelId, setCurrentModelId] = useState<string | null>(null)
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false)

  useEffect(() => {
    setModels(getModelList())
    setCurrentModelId(getCurrentModel())

    const unsubscribe = subscribeLoadingState((state) => {
      setLoadingState(state)
      setCurrentModelId(getCurrentModel())
    })

    return unsubscribe
  }, [])

  // 自动加载上次使用的模型
  useEffect(() => {
    if (autoLoadTriggered) return
    if (loadingState.isLoading) return
    if (isModelLoaded()) return

    const doAutoLoad = async () => {
      setAutoLoadTriggered(true)
      try {
        const savedModel = await getLastUsedModel()
        if (savedModel && getCurrentModel() !== savedModel) {
          console.log("[WebLLM] Auto-loading last used model:", savedModel)
          await loadModel(savedModel)
        }
      } catch (e) {
        console.warn("[WebLLM] Auto-load failed:", e)
      }
    }

    doAutoLoad()
  }, [autoLoadTriggered, loadingState.isLoading])

  const handleLoadModel = useCallback(async (modelId: string) => {
    try {
      await loadModel(modelId)
      // 保存用户选择的模型
      await saveLastUsedModel(modelId)
      toast.success(`模型 ${modelId} 加载完成`)
    } catch (err: any) {
      toast.error(err.message || "加载失败")
    }
  }, [])

  const handleUnloadModel = useCallback(async () => {
    try {
      await unloadModel()
      toast.success("模型已卸载")
    } catch (err: any) {
      toast.error(err.message || "卸载失败")
    }
  }, [])

  const { isLoading, loadingModelId, progress } = loadingState
  const isLoaded = isModelLoaded()

  return (
    <div className="space-y-6">
      {/* 状态栏 */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          <h2 className="font-display text-lg font-semibold">本地模型</h2>
        </div>

        {/* 模型状态 */}
        <div className="mb-4 flex flex-wrap gap-3 rounded-xl border bg-card/60 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("size-2 rounded-full", isLoaded ? "bg-green-500" : isLoading ? "bg-yellow-500 animate-pulse" : "bg-gray-400")} />
            <span>
              {isLoaded ? `已加载: ${currentModelId}` : isLoading ? `加载中: ${loadingModelId}` : "未加载"}
            </span>
          </div>
        </div>

        {/* 加载进度（全屏显示） */}
        {isLoading && progress && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="size-4 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                正在加载 {loadingModelId}...
              </span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{progress.text || "加载中..."}</span>
              <span className="font-medium">{Math.round((progress.progress ?? 0) * 100)}%</span>
            </div>
            <Progress value={(progress.progress ?? 0) * 100} className="h-2" />
          </div>
        )}

        {/* 已加载模型提示 */}
        {isLoaded && currentModelId && !isLoading && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20 p-3">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              当前模型: {currentModelId} ✓
            </p>
          </div>
        )}
      </section>

      {/* 模型卡片轮播 */}
      <section>
        <Carousel
          opts={{
            align: "start",
            loop: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {models.map((model) => {
              const isCurrentModel = currentModelId === model.id
              const isLoadingThis = isLoading && loadingModelId === model.id
              const isLoadingOther = isLoading && loadingModelId !== model.id

              return (
                <CarouselItem key={model.id} className="pl-4 md:basis-1/2 lg:basis-1/3">
                  <ModelCard
                    model={model}
                    isCurrentModel={isCurrentModel}
                    isLoadingThis={isLoadingThis}
                    isLoadingOther={isLoadingOther}
                    progress={isLoadingThis ? progress : null}
                    onLoad={() => handleLoadModel(model.id)}
                    onUnload={handleUnloadModel}
                    disabled={isLoadingOther}
                  />
                </CarouselItem>
              )
            })}
          </CarouselContent>
          <CarouselPrevious className="-left-4" />
          <CarouselNext className="-right-4" />
        </Carousel>
      </section>

      {/* 帮助信息 */}
      <section className="rounded-xl border bg-card p-4">
        <h3 className="font-medium mb-2">关于本地模型</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>· 模型在浏览器中直接运行，无需服务器</li>
          <li>· 使用 WebGPU 硬件加速，推理性能好</li>
          <li>· 模型会自动缓存到本地，关闭浏览器后仍可用</li>
          <li>· 支持 Llama、Phi、Qwen、Mistral、Gemma 等开源模型</li>
          <li>· 所有推理都在本地完成，数据不会上传</li>
        </ul>
      </section>
    </div>
  )
}

export default WebLLMModelBrowser