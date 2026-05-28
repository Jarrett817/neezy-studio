import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  cancelModelDownload,
  deleteModel,
  downloadModel,
  getModelCatalog,
  getModelRecommendations,
  rebuildModelCatalog,
  onModelCatalogUpdated,
  onModelDownloadProgress,
  testOllamaModel,
  type ModelCatalogItem,
  type ModelKind,
  type RuntimeMetrics,
} from "~/services/electron-client"
import {
  isChatModelRunning,
  startChatModel,
  startEmbeddingModel,
  stopChatModel,
  stopEmbeddingModel,
} from "~/services/model-runtime"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
import {
  getCurrentModel,
  getLoadingState,
  subscribeLoadingState,
} from "~/services/llm"

const CATALOG_STALE_MS = 0

function catalogRecommended(items: ModelCatalogItem[]): ModelCatalogItem[] {
  const notInstalled = items.filter((i) => !i.installed)
  const tagged = notInstalled.filter((i) => i.catalogSection === "recommended")
  if (tagged.length > 0) return tagged
  return notInstalled.filter((i) => !i.isLocalOnly)
}

async function fetchModelCatalog(kind: ModelKind): Promise<ModelCatalogItem[]> {
  let items = await getModelCatalog(kind)
  if (items.length > 0) return items
  await rebuildModelCatalog()
  items = await getModelCatalog(kind)
  return items
}

export function useLlmModels() {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ModelKind>("chat")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentChat, setCurrentChat] = useState<string | null>(
    getCurrentModel()
  )
  const [currentEmbedding, setCurrentEmbedding] = useState<string | null>(null)
  const [loadingState, setLoadingState] = useState(getLoadingState())
  const [testingFileName, setTestingFileName] = useState<string | null>(null)
  const deckSelectionPinned = useRef(false)

  const { data: metrics } = useQuery({
    queryKey: ["model-recommendations"],
    queryFn: getModelRecommendations,
    staleTime: 8000,
  })

  const chatCatalogQuery = useQuery({
    queryKey: ["model-catalog", "chat"],
    queryFn: () => fetchModelCatalog("chat"),
    staleTime: CATALOG_STALE_MS,
    refetchOnWindowFocus: true,
  })
  const embeddingCatalogQuery = useQuery({
    queryKey: ["model-catalog", "embedding"],
    queryFn: () => fetchModelCatalog("embedding"),
    staleTime: CATALOG_STALE_MS,
    refetchOnWindowFocus: true,
  })

  const chatItems = chatCatalogQuery.data ?? []
  const embeddingItems = embeddingCatalogQuery.data ?? []
  const refetchChatCatalog = chatCatalogQuery.refetch
  const refetchEmbeddingCatalog = embeddingCatalogQuery.refetch
  const chatFetching = chatCatalogQuery.isFetching
  const embeddingFetching = embeddingCatalogQuery.isFetching
  const catalogError = chatCatalogQuery.error ?? embeddingCatalogQuery.error
  const catalogIsError = chatCatalogQuery.isError || embeddingCatalogQuery.isError

  const items = kind === "chat" ? chatItems : embeddingItems
  const isRefreshing = chatFetching || embeddingFetching

  const localChatItems = useMemo(
    () => chatItems.filter((i) => i.installed),
    [chatItems]
  )
  const recommendedChatItems = useMemo(
    () => catalogRecommended(chatItems),
    [chatItems]
  )
  const localEmbeddingItems = useMemo(
    () => embeddingItems.filter((i) => i.installed),
    [embeddingItems]
  )
  const recommendedEmbeddingItems = useMemo(
    () => catalogRecommended(embeddingItems),
    [embeddingItems]
  )
  const isRecommendedCatalogLoading =
    (kind === "chat" ? recommendedChatItems : recommendedEmbeddingItems).length ===
      0 && isRefreshing

  const syncEmbeddingSelection = useCallback(async () => {
    const settings = await getRuntimeSettings()
    setCurrentEmbedding(settings.embeddingModel || null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      await rebuildModelCatalog()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["model-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["model-recommendations"] }),
        refetchChatCatalog(),
        refetchEmbeddingCatalog(),
        syncEmbeddingSelection(),
      ])
      setCurrentChat(getCurrentModel())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取模型列表")
    }
  }, [
    queryClient,
    refetchChatCatalog,
    refetchEmbeddingCatalog,
    syncEmbeddingSelection,
    rebuildModelCatalog,
  ])

  const catalogBootstrapped = useRef(false)
  useEffect(() => {
    if (catalogBootstrapped.current) return
    catalogBootstrapped.current = true
    void refresh()
  }, [refresh])

  useEffect(() => {
    syncEmbeddingSelection().catch(() => {})
    const unsubLoading = subscribeLoadingState((next) => {
      setLoadingState(next)
      if (!next.isLoading) setCurrentChat(getCurrentModel())
    })
    const unsubDownload = onModelDownloadProgress((next) => {
      const key = ["model-catalog", next.kind] as const
      queryClient.setQueryData<ModelCatalogItem[]>(key, (list) =>
        (list ?? []).map((item) => (item.id === next.id ? next : item))
      )
    })
    const unsubCatalog = onModelCatalogUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["model-catalog"] })
      void queryClient.invalidateQueries({ queryKey: ["model-recommendations"] })
    })
    return () => {
      unsubLoading()
      unsubDownload()
      unsubCatalog()
    }
  }, [queryClient, syncEmbeddingSelection])

  useEffect(() => {
    deckSelectionPinned.current = false
  }, [kind])

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null)
      deckSelectionPinned.current = false
      return
    }
    if (selectedId != null && items.some((i) => i.id === selectedId)) return
    if (selectedId === null && deckSelectionPinned.current) return
    const activeFile = kind === "chat" ? currentChat : currentEmbedding
    const active = items.find((i) => i.fileName === activeFile)
    const recommendedId =
      kind === "chat"
        ? metrics?.recommendedChatId
        : metrics?.recommendedEmbeddingId
    const recommended = items.find((i) => i.id === recommendedId)
    setSelectedId(active?.id ?? recommended?.id ?? items[0].id)
  }, [items, selectedId, kind, currentChat, currentEmbedding, metrics])

  const toggleSelectedId = useCallback((id: string) => {
    deckSelectionPinned.current = true
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const dismissDeckSelection = useCallback(() => {
    deckSelectionPinned.current = true
    setSelectedId(null)
  }, [])

  const selectedItem = items.find((i) => i.id === selectedId) ?? null
  const recommendedId =
    kind === "chat"
      ? (metrics?.recommendedChatId ?? null)
      : (metrics?.recommendedEmbeddingId ?? null)

  const isModelRunning = useCallback(
    (item: ModelCatalogItem) =>
      kind === "chat"
        ? isChatModelRunning(item.fileName)
        : currentEmbedding === item.fileName,
    [kind, currentEmbedding]
  )

  const activeFileName =
    kind === "chat"
      ? currentChat
      : currentEmbedding

  const loadingFileName =
    kind === "chat" && loadingState.isLoading
      ? loadingState.loadingModelId
      : null

  const handleDownload = useCallback(
    async (modelId: string) => {
      try {
        await downloadModel(modelId)
        await refresh()
        toast.success("下载完成")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "下载失败")
      }
    },
    [refresh]
  )

  const handleCancelDownload = useCallback(
    async (modelId: string) => {
      try {
        await cancelModelDownload(modelId)
        await refresh()
        toast.info("已取消下载")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "取消失败")
      }
    },
    [refresh]
  )

  const handleStartChat = useCallback(
    async (item: ModelCatalogItem) => {
      try {
        const settings = await getRuntimeSettings()
        if (settings.llmProvider.kind !== "ollama") {
          await saveRuntimeSettings({
            ...settings,
            llmProvider: {
              ...settings.llmProvider,
              kind: "ollama",
              model: item.fileName,
            },
            llmModel: item.fileName,
            chatTier: item.tier,
          })
          queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        }
        const loadInfo = await startChatModel(item)
        setCurrentChat(item.fileName)
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        const splitHint =
          loadInfo?.layerSplit === "mixed" && loadInfo.gpuLayersOnGpu != null
            ? `（GPU ${loadInfo.gpuLayersOnGpu}/${loadInfo.totalLayers ?? "?"} 层）`
            : loadInfo?.layerSplit === "cpu" || loadInfo?.fallbackCpu
              ? "（CPU）"
              : ""
        toast.success(`已启动：${item.title}${splitHint}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "启动失败")
      }
    },
    [queryClient]
  )

  const handleStopChat = useCallback(
    async (item: ModelCatalogItem) => {
      try {
        await stopChatModel(item.fileName)
        setCurrentChat(getCurrentModel())
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`已关闭：${item.title}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "关闭失败")
      }
    },
    [queryClient]
  )

  const handleStartEmbedding = useCallback(
    async (item: ModelCatalogItem) => {
      try {
        await startEmbeddingModel(item)
        setCurrentEmbedding(item.fileName)
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`已选用：${item.title}（检索时按需加载）`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "选用失败")
      }
    },
    [queryClient]
  )

  const handleStopEmbedding = useCallback(
    async (item: ModelCatalogItem) => {
      try {
        await stopEmbeddingModel(item.fileName)
        setCurrentEmbedding(null)
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`已取消选用：${item.title}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "取消失败")
      }
    },
    [queryClient]
  )

  const handleDelete = useCallback(
    async (modelId: string) => {
      try {
        await deleteModel(modelId)
        await refresh()
        toast.success("已移除本地模型")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "移除失败")
      }
    },
    [refresh]
  )

  const handleTest = useCallback(
    async (modelId: string, modelKind: ModelKind = kind) => {
      const catalog = modelKind === "chat" ? chatItems : embeddingItems
      const item = catalog.find((i) => i.id === modelId)
      if (!item?.installed) {
        toast.error("请先下载模型再测试")
        return
      }
      setTestingFileName(item.fileName)
      try {
        const result = await testOllamaModel(item.fileName, modelKind)
        if (result.ok) {
          const hint = result.preview ? `：${result.preview}` : ""
          toast.success(`测试通过（${result.latencyMs} ms）${hint}`)
        } else {
          toast.error(result.error ?? "测试失败")
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "测试失败")
      } finally {
        setTestingFileName(null)
      }
    },
    [kind, chatItems, embeddingItems]
  )

  const toggleModelRun = useCallback(
    async (modelId: string, modelKind: ModelKind = kind) => {
      const catalog = modelKind === "chat" ? chatItems : embeddingItems
      const item = catalog.find((i) => i.id === modelId)
      if (!item?.installed) return
      if (modelKind === kind) setSelectedId(modelId)
      if (modelKind === "chat") {
        if (isChatModelRunning(item.fileName)) {
          await handleStopChat(item)
        } else {
          await handleStartChat(item)
        }
      } else if (currentEmbedding === item.fileName) {
        await handleStopEmbedding(item)
      } else {
        await handleStartEmbedding(item)
      }
    },
    [
      kind,
      chatItems,
      embeddingItems,
      currentEmbedding,
      handleStartChat,
      handleStopChat,
      handleStartEmbedding,
      handleStopEmbedding,
    ]
  )

  const useSelected = useCallback(async () => {
    if (!selectedId) return
    await toggleModelRun(selectedId)
  }, [selectedId, toggleModelRun])

  const selectAdjacent = useCallback(
    (delta: -1 | 1) => {
      if (items.length === 0) return
      const idx = items.findIndex((i) => i.id === selectedId)
      const next = (idx + delta + items.length) % items.length
      setSelectedId(items[next].id)
    },
    [items, selectedId]
  )

  return {
    kind,
    setKind,
    items,
    chatItems,
    localChatItems,
    recommendedChatItems,
    localEmbeddingItems,
    recommendedEmbeddingItems,
    isRecommendedCatalogLoading,
    embeddingItems,
    metrics: metrics as RuntimeMetrics | undefined,
    selectedId,
    setSelectedId,
    toggleSelectedId,
    dismissDeckSelection,
    selectedItem,
    recommendedId,
    currentChat,
    currentEmbedding,
    activeFileName,
    loadingFileName,
    loadingState,
    isRefreshing,
    catalogIsError,
    catalogError,
    isModelRunning,
    refresh,
    handleDownload,
    handleCancelDownload,
    handleDelete,
    handleTest,
    testingFileName,
    handleStartChat,
    handleStopChat,
    handleStartEmbedding,
    handleStopEmbedding,
    useSelected,
    toggleModelRun,
    selectAdjacent,
  }
}
