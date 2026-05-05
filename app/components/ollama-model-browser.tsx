import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import {
  listOllamaModels,
  pullOllamaModel,
  deleteOllamaModel,
  isOllamaRunning,
} from "~/services/workspace"

// 模型分级（按家用电脑性能分类）
// 原则：使用各家族最新最好的端侧模型，不重复推荐旧版本
// 低配：集成显卡/旧独显，4GB RAM，推荐 1GB 以内模型
// 中配：入门独显 GTX 1060+ · 8GB RAM，推荐 2-3GB 模型
// 高配：RTX 3060+ · 16GB RAM，推荐 4GB+ 模型
const MODEL_TIERS = {
  low: {
    label: "轻量级",
    desc: "集成显卡 · 4GB RAM",
    icon: "🪁",
    models: [
      { name: "gemma3:1b", label: "Gemma 3 1B", desc: "Google 最新 1B 模型", size: "~800MB" },
      { name: "qwen3:0.6b", label: "Qwen3 0.6B", desc: "阿里最小体积模型", size: "~400MB" },
      { name: "nomic-embed-text:latest", label: "Nomic Embed", desc: "Embedding 向量模型，用于知识库检索", size: "~274MB" },
    ],
  },
  mid: {
    label: "均衡级",
    desc: "入门独显 GTX 1060+ · 8GB RAM",
    icon: "⚖️",
    models: [
      { name: "qwen3:1.7b", label: "Qwen3 1.7B", desc: "阿里新一代主流模型，支持 Agent", size: "~1.2GB" },
      { name: "gemma4:1b", label: "Gemma 4 1B", desc: "Google 最新 1B 模型", size: "~900MB" },
      { name: "llama3.2:3b", label: "Llama 3.2 3B", desc: "英文强项，通用能力强", size: "~2GB" },
      { name: "phi3:latest", label: "Phi-3 3.8B", desc: "微软轻量模型", size: "~2.3GB" },
    ],
  },
  high: {
    label: "高性能",
    desc: "RTX 3060+ · 16GB RAM",
    icon: "🚀",
    models: [
      { name: "qwen3:4b", label: "Qwen3 4B", desc: "阿里新一代均衡模型，支持 Agent", size: "~2.4GB" },
      { name: "gemma4:4b", label: "Gemma 4 4B", desc: "Google 最新均衡模型", size: "~2.5GB" },
      { name: "qwen2.5:7b", label: "Qwen2.5 7B", desc: "强力中文模型，16GB 内存推荐", size: "~4GB" },
      { name: "llama3.2:7b", label: "Llama 3.2 7B", desc: "英文强力模型", size: "~4GB" },
      { name: "qwen2.5:14b", label: "Qwen2.5 14B", desc: "超大中文模型", size: "~8GB" },
      { name: "codellama:7b", label: "Code Llama 7B", desc: "代码专用模型", size: "~4GB" },
      { name: "gemma2:9b", label: "Gemma 2 9B", desc: "Google 主力模型", size: "~5GB" },
    ],
  },
}

type PullProgress = {
  status: string
  digest: string
  total: number
  completed: number
}

export function OllamaModelBrowser() {
  const queryClient = useQueryClient()
  const [customModel, setCustomModel] = useState("")
  const [pullingModel, setPullingModel] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null)

  // 检查 Ollama 是否运行
  const { data: ollamaRunning, isLoading: checkingOllama } = useQuery({
    queryKey: ["ollama-running"],
    queryFn: isOllamaRunning,
    refetchInterval: 5000,
  })

  // 获取模型列表
  const { data: models, isLoading: loadingModels, refetch: refetchModels } = useQuery({
    queryKey: ["ollama-models"],
    queryFn: listOllamaModels,
    enabled: !!ollamaRunning,
  })

  // 拉取模型
  const pullModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      setPullingModel(modelName)
      setPullProgress(null)
      await pullOllamaModel(modelName, (progress) => {
        setPullProgress(progress)
      })
    },
    onSuccess: (_, modelName) => {
      toast.success(`模型 ${modelName} 下载完成`)
      setPullingModel(null)
      setPullProgress(null)
      queryClient.invalidateQueries({ queryKey: ["ollama-models"] })
    },
    onError: (err: Error, modelName) => {
      toast.error(`下载 ${modelName} 失败: ${err.message}`)
      setPullingModel(null)
      setPullProgress(null)
    },
  })

  // 删除模型
  const deleteModelMutation = useMutation({
    mutationFn: deleteOllamaModel,
    onSuccess: (_, modelName) => {
      toast.success(`已删除模型 ${modelName}`)
      queryClient.invalidateQueries({ queryKey: ["ollama-models"] })
    },
    onError: (err: Error, modelName) => {
      toast.error(`删除 ${modelName} 失败: ${err.message}`)
    },
  })

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    }
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  // 计算下载进度百分比
  const progressPercent = pullProgress?.total
    ? Math.round((pullProgress.completed / pullProgress.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* 快速下载推荐模型 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("size-4", loadingModels && "animate-spin")} />
            <h2 className="font-display text-lg font-semibold">下载模型</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchModels()}
            disabled={loadingModels || !ollamaRunning}
          >
            <RefreshCw className={cn("size-4 mr-1", loadingModels && "animate-spin")} />
            刷新
          </Button>
        </div>

        {/* 按性能等级分类的模型下载 */}
        <div className="space-y-6">
          {(Object.entries(MODEL_TIERS) as [keyof typeof MODEL_TIERS, typeof MODEL_TIERS.low][]).map(([tier, tierData]) => (
            <div key={tier}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{tierData.icon}</span>
                <div>
                  <h3 className="font-medium">{tierData.label}</h3>
                  <p className="text-xs text-muted-foreground">{tierData.desc}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {tierData.models.map((model) => {
                  const isInstalled = models?.some(m => m.name === model.name || m.name === `ollama/${model.name}`)
                  const isPulling = pullingModel === model.name
                  const isPullingThisModel = pullingModel !== null && pullingModel !== model.name

                  return (
                    <Card
                      key={model.name}
                      className={cn(
                        "transition-all",
                        isInstalled && "border-green-500 bg-green-50/50 dark:bg-green-950/20",
                      )}
                    >
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{model.label}</p>
                            <p className="text-xs text-muted-foreground">{model.size}</p>
                          </div>
                          {isInstalled && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                              已安装
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{model.desc}</p>
                        <div className="flex gap-2 pt-1">
                          {isPulling ? (
                            <div className="flex-1 space-y-1">
                              <Progress value={progressPercent} className="h-1.5" />
                              <p className="text-xs text-muted-foreground text-center">
                                {pullProgress?.status || "下载中..."} {progressPercent}%
                              </p>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant={isInstalled ? "outline" : "default"}
                                className="flex-1"
                                disabled={isPullingThisModel || !ollamaRunning}
                                onClick={() => pullModelMutation.mutate(model.name)}
                              >
                                {isPullingThisModel ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : isInstalled ? (
                                  "重新下载"
                                ) : (
                                  "下载"
                                )}
                              </Button>
                              {isInstalled && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteModelMutation.mutate(model.name)}
                                  disabled={deleteModelMutation.isPending}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 自定义模型名称输入 */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold">自定义模型</h2>
        </div>
        <div className="flex gap-3">
          <Input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="输入模型名称，如：llama3:8b-instruct"
            className="flex-1"
            disabled={pullingModel !== null}
          />
          <Button
            onClick={() => {
              if (customModel.trim()) {
                pullModelMutation.mutate(customModel.trim())
                setCustomModel("")
              }
            }}
            disabled={!customModel.trim() || pullingModel !== null || !ollamaRunning}
          >
            {pullingModel !== null ? <Loader2 className="size-4 animate-spin" /> : "下载"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          你可以输入 Ollama 库中的任何模型，如 llama3.2、codellama、phi 等
        </p>
      </section>

      {/* 已安装模型列表 */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold">已安装模型</h2>
        </div>

        {loadingModels && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingModels && (!models || models.length === 0) && (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">暂无已安装的模型</p>
            <p className="text-sm text-muted-foreground mt-1">请从上方列表下载模型</p>
          </div>
        )}

        {models && models.length > 0 && (
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <div className="relative flex items-center">
              <CarouselPrevious className="left-0 z-10" />
              <CarouselContent className="ml-4 mr-12">
                {models.map((model) => (
                  <CarouselItem key={model.name} className="basis-auto">
                    <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2">
                      <span className="font-medium text-sm">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{formatSize(model.size || 0)}</span>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselNext className="right-8 z-10" />
            </div>
          </Carousel>
        )}
      </section>

      {/* 帮助信息 */}
      <section className="rounded-xl border bg-card p-4">
        <h3 className="font-medium mb-2">关于 Ollama 模型</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>· 模型存储在 Ollama 本地目录，重复下载会自动跳过已下载部分</li>
          <li>· 模型支持 GPU 加速（需要显卡支持）</li>
          <li>· 删除模型不会影响正在使用的模型</li>
          <li>· 视觉模型（如 qwen2.5-vl）可理解图片内容</li>
          <li>· Embedding 模型（如 nomic-embed-text）用于知识库向量检索</li>
        </ul>
      </section>
    </div>
  )
}

// 导出默认（兼容旧导入）
export default OllamaModelBrowser