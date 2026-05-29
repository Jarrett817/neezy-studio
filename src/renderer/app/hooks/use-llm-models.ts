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
  type RuntimeMetrics,
} from "~/services/electron-client"
import {
  isCatalogItemRunning,
  startChatModel,
  stopChatModel,
} from "~/services/model-runtime"
import { findOllamaChatEntry } from "~/config/chat-models"
import { getRuntimeSettings } from "~/services/settings"
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

async function fetchChatCatalog(): Promise<ModelCatalogItem[]> {
  let items = await getModelCatalog("chat")
  if (items.length > 0) return items
  await rebuildModelCatalog()
  items = await getModelCatalog("chat")
  return items
}

export function useLlmModels() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentChat, setCurrentChat] = useState<string | null>(
    getCurrentModel()
  )
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
    queryFn: fetchChatCatalog,
    staleTime: CATALOG_STALE_MS,
    refetchOnWindowFocus: true,
  })

  const chatItems = chatCatalogQuery.data ?? []
  const refetchChatCatalog = chatCatalogQuery.refetch
  const isRefreshing = chatCatalogQuery.isFetching
  const catalogError = chatCatalogQuery.error
  const catalogIsError = chatCatalogQuery.isError

  const localChatItems = useMemo(
    () => chatItems.filter((i) => i.installed),
    [chatItems]
  )
  const recommendedChatItems = useMemo(
    () => catalogRecommended(chatItems),
    [chatItems]
  )
  const isRecommendedCatalogLoading =
    recommendedChatItems.length === 0 && isRefreshing

  const syncFromSettings = useCallback(async () => {
    const settings = await getRuntimeSettings()
    const ollama = findOllamaChatEntry(settings.chatModels)
    if (ollama?.enabled && ollama.model) setCurrentChat(ollama.model)
  }, [])

  const refresh = useCallback(async () => {
    try {
      await rebuildModelCatalog()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["model-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["model-recommendations"] }),
        refetchChatCatalog(),
        syncFromSettings(),
      ])
      const settings = await getRuntimeSettings()
      const ollama = findOllamaChatEntry(settings.chatModels)
      setCurrentChat(getCurrentModel() ?? ollama?.model ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取模型列表")
    }
  }, [queryClient, refetchChatCatalog, syncFromSettings])

  const catalogBootstrapped = useRef(false)
  useEffect(() => {
    if (catalogBootstrapped.current) return
    catalogBootstrapped.current = true
    void refresh()
  }, [refresh])

  useEffect(() => {
    syncFromSettings().catch(() => {})
    const unsubLoading = subscribeLoadingState((next) => {
      setLoadingState(next)
      if (!next.isLoading) setCurrentChat(getCurrentModel())
    })
    const unsubDownload = onModelDownloadProgress((next) => {
      if (next.kind !== "chat") return
      const key = ["model-catalog", "chat"] as const
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
  }, [queryClient, syncFromSettings])

  useEffect(() => {
    if (chatItems.length === 0) {
      setSelectedId(null)
      deckSelectionPinned.current = false
      return
    }
    if (selectedId != null && chatItems.some((i) => i.id === selectedId)) return
    if (selectedId === null && deckSelectionPinned.current) return
    const active = chatItems.find((i) => i.fileName === currentChat)
    const recommended = chatItems.find(
      (i) => i.id === metrics?.recommendedChatId
    )
    setSelectedId(active?.id ?? recommended?.id ?? chatItems[0].id)
  }, [chatItems, selectedId, currentChat, metrics])

  const toggleSelectedId = useCallback((id: string) => {
    deckSelectionPinned.current = true
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const recommendedId = metrics?.recommendedChatId ?? null
  const activeFileName = currentChat
  const loadingFileName =
    loadingState.isLoading ? loadingState.loadingModelId : null

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
        const loadInfo = await startChatModel(item)
        setCurrentChat(item.path ?? item.fileName)
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
    async (modelId: string) => {
      const item = chatItems.find((i) => i.id === modelId)
      if (!item?.installed) {
        toast.error("请先下载模型再测试")
        return
      }
      const ref = item.path?.trim() || item.fileName
      setTestingFileName(ref)
      try {
        const result = await testOllamaModel(ref, "chat")
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
    [chatItems]
  )

  const toggleModelRun = useCallback(
    async (modelId: string) => {
      const item = chatItems.find((i) => i.id === modelId)
      if (!item?.installed) return
      setSelectedId(modelId)
      if (isCatalogItemRunning(item)) {
        await handleStopChat(item)
      } else {
        await handleStartChat(item)
      }
    },
    [chatItems, handleStartChat, handleStopChat]
  )

  return {
    chatItems,
    localChatItems,
    recommendedChatItems,
    isRecommendedCatalogLoading,
    metrics: metrics as RuntimeMetrics | undefined,
    selectedId,
    toggleSelectedId,
    recommendedId,
    currentChat,
    activeFileName,
    loadingFileName,
    loadingState,
    isRefreshing,
    catalogIsError,
    catalogError,
    refresh,
    handleDownload,
    handleCancelDownload,
    handleDelete,
    handleTest,
    testingFileName,
    handleStartChat,
    toggleModelRun,
  }
}
