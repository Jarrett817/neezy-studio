import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Progress } from "~/components/ui/progress"
import { cn } from "~/lib/utils"
import {
  listOllamaModels,
  pullOllamaModel,
  deleteOllamaModel,
  showOllamaModel,
  isOllamaRunning,
  ensureOllamaRunning,
  type OllamaModel,
} from "~/services/workspace"

// 常用模型列表（快速选择）
const RECOMMENDED_MODELS = [
  { name: "qwen3:1.7b", label: "Qwen3 1.7B", desc: "轻量中文模型，适合低配置机器", size: "~1.2GB" },
  { name: "qwen3:4b", label: "Qwen3 4B", desc: "均衡中文模型，16GB 内存推荐", size: "~2.6GB" },
  { name: "qwen3:8b", label: "Qwen3 8B", desc: "高质量中文模型，需要高配置", size: "~4.5GB" },
  { name: "qwen2.5:3b", label: "Qwen2.5 3B", desc: "通用中文模型", size: "~2.2GB" },
  { name: "llama3.2:3b", label: "Llama 3.2 3B", desc: "英文为主，通用能力强", size: "~2.1GB" },
  { name: "gemma2:2b", label: "Gemma 2 2B", desc: "轻量级 Google 模型", size: "~1.6GB" },
  { name: "phi3:latest", label: "Phi-3", desc: "微软轻量模型", size: "~2.3GB" },
  { name: "mistral:latest", label: "Mistral", desc: "欧洲开源模型", size: "~4.1GB" },
  { name: "qwen2.5-vl:3b", label: "Qwen2.5-VL 3B", desc: "视觉模型，可理解图片", size: "~2.2GB" },
  { name: "nomic-embed-text", label: "Nomic Embed Text", desc: "Embedding 模型，用于知识库", size: "~274MB" },
]

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
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [modelDetails, setModelDetails] = useState<Map<string, Awaited<ReturnType<typeof showOllamaModel>>>>(new Map())

  // 检查 Ollama 是否运行
  const { data: ollamaRunning, isLoading: checkingOllama } = useQuery({
    queryKey: ["ollama-running"],
    queryFn: isOllamaRunning,
    refetchInterval: 5000,
  })

  // 启动 Ollama
  const startOllamaMutation = useMutation({
    mutationFn: ensureOllamaRunning,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ollama-running"] })
      toast.success("Ollama 已启动")
    },
    onError: (err: Error) => {
      toast.error(`启动 Ollama 失败: ${err.message}`)
    },
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

  // 查看模型详情
  const viewDetailsMutation = useMutation({
    mutationFn: showOllamaModel,
    onSuccess: (details, modelName) => {
      setModelDetails(prev => new Map(prev).set(modelName, details))
      setExpandedModel(modelName)
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // 计算下载进度百分比
  const progressPercent = pullProgress?.total
    ? Math.round((pullProgress.completed / pullProgress.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Ollama 状态检查 */}
      {!ollamaRunning && !checkingOllama && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Ollama 服务未运行</span>
            <Button
              size="sm"
              onClick={() => startOllamaMutation.mutate()}
              disabled={startOllamaMutation.isPending}
            >
              {startOllamaMutation.isPending ? "启动中..." : "启动 Ollama"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

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

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {RECOMMENDED_MODELS.map((model) => {
            const isInstalled = models?.some(m => m.name === model.name || m.name === `ollama/${model.name}`)
            const isPulling = pullingModel === model.name
            const isPullingThisModel = pullingModel !== null && pullingModel !== model.name

            return (
              <Card
                key={model.name}
                className={cn(
                  "transition-all",
                  isInstalled && "border-green-500 bg-green-50/50",
                )}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{model.label}</p>
                      <p className="text-xs text-muted-foreground">{model.size}</p>
                    </div>
                    {isInstalled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
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
          <div className="space-y-2">
            {models.map((model) => (
              <Card key={model.name} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    if (expandedModel === model.name) {
                      setExpandedModel(null)
                    } else if (!modelDetails.has(model.name)) {
                      viewDetailsMutation.mutate(model.name)
                    } else {
                      setExpandedModel(model.name)
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(model.size || 0)} · {model.model}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {model.modified_at ? formatDate(model.modified_at) : ""}
                      </span>
                      {expandedModel === model.name ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </div>
                  </div>

                  {/* 详情展开 */}
                  {expandedModel === model.name && modelDetails.has(model.name) && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">格式：</span>
                          <span>{modelDetails.get(model.name)?.details.format}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">参数量：</span>
                          <span>{modelDetails.get(model.name)?.details.parameter_size}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">量化：</span>
                          <span>{modelDetails.get(model.name)?.details.quantization_level}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">家族：</span>
                          <span>{modelDetails.get(model.name)?.details.family}</span>
                        </div>
                      </div>
                      {modelDetails.get(model.name)?.template && (
                        <div className="mt-2">
                          <span className="text-muted-foreground text-sm">模板：</span>
                          <code className="mt-1 block text-xs bg-muted p-2 rounded">
                            {modelDetails.get(model.name)?.template}
                          </code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
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