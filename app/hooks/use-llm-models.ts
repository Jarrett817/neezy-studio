import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  deleteModel,
  downloadModel,
  getModelCatalog,
  getModelRecommendations,
  onModelDownloadProgress,
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
import { getRuntimeSettings } from "~/services/settings"
import {
  getCurrentModel,
  getLoadingState,
  subscribeLoadingState,
} from "~/services/llm"

const CATALOG_STALE_MS = 0

export function useLlmModels() {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ModelKind>("chat")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentChat, setCurrentChat] = useState<string | null>(
    getCurrentModel()
  )
  const [currentEmbedding, setCurrentEmbedding] = useState<string | null>(null)
  const [loadingState, setLoadingState] = useState(getLoadingState())
  const deckSelectionPinned = useRef(false)

  const { data: metrics } = useQuery({
    queryKey: ["model-recommendations"],
    queryFn: getModelRecommendations,
    staleTime: 8000,
  })

  const {
    data: chatItems = [],
    isFetching: chatFetching,
    refetch: refetchChatCatalog,
  } = useQuery({
    queryKey: ["model-catalog", "chat"],
    queryFn: () => getModelCatalog("chat"),
    staleTime: CATALOG_STALE_MS,
    refetchOnWindowFocus: true,
  })

  const {
    data: embeddingItems = [],
    isFetching: embeddingFetching,
    refetch: refetchEmbeddingCatalog,
  } = useQuery({
    queryKey: ["model-catalog", "embedding"],
    queryFn: () => getModelCatalog("embedding"),
    staleTime: CATALOG_STALE_MS,
    refetchOnWindowFocus: true,
  })

  const items = kind === "chat" ? chatItems : embeddingItems
  const isRefreshing = chatFetching || embeddingFetching

  const syncEmbeddingSelection = useCallback(async () => {
    const settings = await getRuntimeSettings()
    setCurrentEmbedding(settings.embeddingModel || null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["model-catalog"] }),
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
  ])

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
    return () => {
      unsubLoading()
      unsubDownload()
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

  const handleStartChat = useCallback(
    async (item: ModelCatalogItem) => {
      try {
        await startChatModel(item)
        setCurrentChat(item.fileName)
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`已启动：${item.title}`)
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
    isModelRunning,
    refresh,
    handleDownload,
    handleDelete,
    handleStartChat,
    handleStopChat,
    handleStartEmbedding,
    handleStopEmbedding,
    useSelected,
    toggleModelRun,
    selectAdjacent,
  }
}
