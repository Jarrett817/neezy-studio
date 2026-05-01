import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Loader2, Search, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "~/components/ui/carousel"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "~/components/ui/pagination"
import { Progress } from "~/components/ui/progress"
import { ModelHeroCard } from "~/components/model-card"
import {
  getModelFiles,
  getRuntimeMetrics,
  listHfModels,
  startModelDownload,
  type HuggingFaceFile,
  type HuggingFaceModel,
  type HfModelListResult,
  type ModelDownloadTask,
} from "~/services/workspace"

type SortOption = "downloads" | "likes"

// Recommend model sizes based on available memory (in GB)
function getRecommendedModelSizes(availableMemoryGb: number): string {
  if (availableMemoryGb >= 32) {
    return "7b 8b 13b"  // High-end machines
  } else if (availableMemoryGb >= 16) {
    return "3b 4b 7b 5b"  // Mid-range machines
  } else if (availableMemoryGb >= 8) {
    return "1.5b 2b 3b 4b"  // Low-end machines
  } else {
    return "0.5b 1b 1.5b 2b"  // Very low memory
  }
}

export function ModelBrowser() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("downloads")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [selectedModel, setSelectedModel] = useState<HuggingFaceModel | null>(null)
  const [files, setFiles] = useState<HuggingFaceFile[]>([])
  const [smartSearch, setSmartSearch] = useState("")
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)

  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
  })

  // Compute recommended model sizes based on available memory
  const recommendedSizes = metrics?.availableMemoryGb
    ? getRecommendedModelSizes(metrics.availableMemoryGb)
    : "1.5b 3b 7b"

  // Use first recommended size for initial query to avoid empty results
  const initialSearchSize = recommendedSizes.split(" ")[0] || "3b"

  const { data: modelList, isLoading: loadingModels } = useQuery({
    queryKey: ["hf-models", searchQuery, sortBy, page, pageSize],
    queryFn: () => listHfModels(
      searchQuery || initialSearchSize,
      sortBy,
      page,
      pageSize
    ),
  })

  const queryClient = useQueryClient()

  const { data: repoFiles, isLoading: loadingFiles } = useQuery({
    queryKey: ["model-files", selectedModel?.id],
    queryFn: () => selectedModel ? getModelFiles(selectedModel.id) : Promise.resolve([]),
    enabled: !!selectedModel,
  })

  // Sync repoFiles to local files state
  useEffect(() => {
    if (repoFiles) setFiles(repoFiles)
  }, [repoFiles])

  const startDownloadMutation = useMutation({
    mutationFn: async ({ repoId, filePath }: { repoId: string; filePath: string }) => {
      const fileName = filePath.split('/').pop() || filePath
      toast.info(`开始下载 ${fileName}`, { duration: 3000 })
      setDownloadingFile(filePath)
      try {
        await startModelDownload("", repoId, filePath)
      } finally {
        setDownloadingFile(null)
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["model-download-tasks"] }) },
    onError: (err) => {
      setDownloadingFile(null)
      toast.error(`下载失败: ${err.message}`)
    },
  })

  const ggufFiles = files.filter(f => f.path.toLowerCase().endsWith(".gguf"))

  const handleModelSelect = (model: HuggingFaceModel) => {
    setSelectedModel(model)
    setFiles([])
  }

  const handleSearch = () => {
    setPage(1)
    setSearchQuery(smartSearch)
  }

  const handleQuickSelect = (size: string) => {
    setSmartSearch(size)
    setPage(1)
    setSearchQuery(size)
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          <strong>推荐模型：</strong>根据您电脑 {metrics?.availableMemoryGb?.toFixed(1) ?? "?"} GB 可用内存，推荐 {recommendedSizes.split(" ").map(s => s.toUpperCase()).join(", ")} 规模的模型。点击下方按钮快速筛选。
        </AlertDescription>
      </Alert>

      {/* Quick size filters */}
      <div className="flex flex-wrap gap-2">
        <Label className="text-sm text-muted-foreground mr-2">快速筛选：</Label>
        {["0.5b", "1b", "1.5b", "2b", "3b", "4b", "7b", "8b"].map(size => (
          <Button
            key={size}
            variant={smartSearch === size ? "default" : "outline"}
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => handleQuickSelect(size)}
          >
            {size.toUpperCase()}
          </Button>
        ))}
      </div>

      {/* 搜索和排序 */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
            <Search className="size-4 text-muted-foreground" />
          </div>
          <Input
            value={smartSearch}
            onChange={(e) => setSmartSearch(e.target.value)}
            placeholder="搜索模型关键词"
            className="pl-9 bg-card/60"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="h-10 appearance-none bg-card/60 border rounded-lg px-3 pr-8 text-sm"
        >
          <option value="downloads">下载最多</option>
          <option value="likes">点赞最多</option>
        </select>
        <Button onClick={handleSearch} className="gap-2 rounded-xl">
          搜索
        </Button>
      </div>

      {/* 模型列表 */}
      {loadingModels && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {modelList && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">找到 {modelList.total} 个模型</Label>
            <span className="text-sm text-muted-foreground">第 {modelList.page} / {modelList.totalPages} 页</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {modelList.models.map((model) => (
              <Card
                key={model.id}
                className="group cursor-pointer transition-all hover:border-primary/50"
                onClick={() => handleModelSelect(model)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium text-sm truncate">{model.id}</p>
                      <p className="text-xs text-muted-foreground">by {model.author}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); window.open(`https://huggingface.co/${model.id}`, "_blank") }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted/50"
                      title="在 Hugging Face 查看"
                    >
                      <ExternalLink className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {model.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{model.downloads?.toLocaleString() ?? 0} 下载</span>
                    <span>{model.likes?.toLocaleString() ?? 0} 点赞</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 分页 */}
          {modelList.totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {page > 2 && (
                  <>
                    <PaginationItem>
                      <PaginationLink onClick={() => setPage(1)}>1</PaginationLink>
                    </PaginationItem>
                    <PaginationEllipsis />
                  </>
                )}

                {page > 1 && (
                  <PaginationItem>
                    <PaginationLink onClick={() => setPage(page - 1)}>{page - 1}</PaginationLink>
                  </PaginationItem>
                )}

                <PaginationItem>
                  <PaginationLink isActive>{page}</PaginationLink>
                </PaginationItem>

                {page < modelList.totalPages && (
                  <PaginationItem>
                    <PaginationLink onClick={() => setPage(page + 1)}>{page + 1}</PaginationLink>
                  </PaginationItem>
                )}

                {page < modelList.totalPages - 1 && (
                  <PaginationEllipsis />
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage(p => Math.min(modelList.totalPages, p + 1))}
                    className={page >= modelList.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      {/* 选中模型的文件列表 */}
      {selectedModel && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">{selectedModel.id}</Label>
              <p className="text-sm text-muted-foreground">{selectedModel.author}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedModel(null)}>
              关闭
            </Button>
          </div>

          {loadingFiles && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {ggufFiles.length > 0 && (
            <>
              <p className="text-sm font-medium">选择要下载的文件：</p>
              <div className="relative">
                <Carousel opts={{ align: "center", loop: ggufFiles.length > 2 }} className="w-full">
                  <CarouselContent>
                    {ggufFiles.map((file) => {
                      return (
                        <CarouselItem key={file.path} className="md:basis-1/2 lg:basis-1/3">
                          <ModelHeroCard
                            repoId={selectedModel.id}
                            file={file}
                            onDownload={() => startDownloadMutation.mutate({ repoId: selectedModel.id, filePath: file.path })}
                            isDownloading={downloadingFile === file.path}
                          />
                        </CarouselItem>
                      )
                    })}
                  </CarouselContent>
                  {ggufFiles.length > 2 && (
                    <>
                      <CarouselPrevious className="-left-4" />
                      <CarouselNext className="-right-4" />
                    </>
                  )}
                </Carousel>
              </div>
            </>
          )}

          {ggufFiles.length === 0 && !loadingFiles && (
            <p className="text-sm text-muted-foreground">该仓库暂无 GGUF 文件</p>
          )}
        </div>
      )}
    </div>
  )
}