import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  deleteModel,
  downloadModel,
  getEmbeddingStatus,
  getModelCatalog,
  getModelRecommendations,
  onModelDownloadProgress,
  type ModelCatalogItem,
  type ModelKind,
  type RuntimeMetrics,
} from "~/services/electron-client"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
import {
  getCurrentModel,
  getLoadingState,
  isElectronLlmAvailable,
  loadEmbeddingByFileName,
  loadModel,
  subscribeLoadingState,
} from "~/services/llm"

const LAST_CHAT_MODEL_KEY = "neezy-llm-last-model"

async function saveChatModelChoice(fileName: string) {
  localStorage.setItem(LAST_CHAT_MODEL_KEY, fileName)
  const settings = await getRuntimeSettings()
  await saveRuntimeSettings({ ...settings, llmModel: fileName })
}

async function saveEmbeddingModelChoice(
  fileName: string,
  tier: ModelCatalogItem["tier"]
) {
  const settings = await getRuntimeSettings()
  await saveRuntimeSettings({
    ...settings,
    embeddingModel: fileName,
    embeddingTier: tier,
  })
}

export function useLlmModels() {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ModelKind>("chat")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chatItems, setChatItems] = useState<ModelCatalogItem[]>([])
  const [embeddingItems, setEmbeddingItems] = useState<ModelCatalogItem[]>([])
  const [currentChat, setCurrentChat] = useState<string | null>(
    getCurrentModel()
  )
  const [currentEmbedding, setCurrentEmbedding] = useState<string | null>(null)
  const [loadingState, setLoadingState] = useState(getLoadingState())
  const [embeddingLoadingId, setEmbeddingLoadingId] = useState<string | null>(
    null
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const deckSelectionPinned = useRef(false)

  const { data: metrics } = useQuery({
    queryKey: ["model-recommendations"],
    queryFn: getModelRecommendations,
    staleTime: 8000,
  })

  const items = kind === "chat" ? chatItems : embeddingItems

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [chat, embedding, embStatus, settings] = await Promise.all([
        getModelCatalog("chat"),
        getModelCatalog("embedding"),
        getEmbeddingStatus(),
        getRuntimeSettings(),
      ])
      setChatItems(chat)
      setEmbeddingItems(embedding)
      setCurrentEmbedding(
        embStatus.modelId
          ? settings.embeddingModel
          : settings.embeddingModel || null
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取模型列表")
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsubLoading = subscribeLoadingState(setLoadingState)
    const unsubDownload = onModelDownloadProgress((next) => {
      const updater = (list: ModelCatalogItem[]) =>
        list.map((item) => (item.id === next.id ? next : item))
      if (next.kind === "chat") setChatItems(updater)
      else setEmbeddingItems(updater)
    })
    return () => {
      unsubLoading()
      unsubDownload()
    }
  }, [refresh])

  useEffect(() => {
    if (!isElectronLlmAvailable() || currentChat || chatItems.length === 0)
      return
    const saved = localStorage.getItem(LAST_CHAT_MODEL_KEY)
    const candidate = chatItems.find(
      (item) => item.installed && (!saved || item.fileName === saved)
    )
    if (!candidate) return
    loadModel(candidate.fileName)
      .then(async () => {
        setCurrentChat(candidate.fileName)
        await saveChatModelChoice(candidate.fileName)
      })
      .catch((error) => console.warn("[LLM] Auto-load failed:", error))
  }, [chatItems, currentChat])

  useEffect(() => {
    if (!metrics || embeddingItems.length === 0) return
    getRuntimeSettings()
      .then((settings) => {
        if (settings.embeddingModel) {
          setCurrentEmbedding(settings.embeddingModel)
          return
        }
        const recommended = embeddingItems.find(
          (item) => item.id === metrics.recommendedEmbeddingId && item.installed
        )
        if (!recommended) return
        return loadEmbeddingByFileName(
          recommended.fileName,
          recommended.id
        ).then(() => {
          setCurrentEmbedding(recommended.fileName)
          queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        })
      })
      .catch(() => {})
  }, [metrics, embeddingItems, queryClient])

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
  const activeFileName = kind === "chat" ? currentChat : currentEmbedding
  const loadingFileName =
    kind === "chat"
      ? loadingState.isLoading
        ? loadingState.loadingModelId
        : null
      : embeddingLoadingId
        ? (embeddingItems.find((i) => i.id === embeddingLoadingId)?.fileName ??
          null)
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

  const handleUseChat = useCallback(
    async (item: ModelCatalogItem) => {
      try {
        await loadModel(item.fileName)
        await saveChatModelChoice(item.fileName)
        setCurrentChat(item.fileName)
        const settings = await getRuntimeSettings()
        await saveRuntimeSettings({
          ...settings,
          llmModel: item.fileName,
          chatTier: item.tier,
        })
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`对话模型：${item.title}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载失败")
      }
    },
    [queryClient]
  )

  const handleUseEmbedding = useCallback(
    async (item: ModelCatalogItem) => {
      setEmbeddingLoadingId(item.id)
      try {
        await loadEmbeddingByFileName(item.fileName, item.id)
        await saveEmbeddingModelChoice(item.fileName, item.tier)
        setCurrentEmbedding(item.fileName)
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`Embedding：${item.title}`)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Embedding 加载失败"
        )
      } finally {
        setEmbeddingLoadingId(null)
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

  const switchToModel = useCallback(
    async (modelId: string) => {
      const item = items.find((i) => i.id === modelId)
      if (!item?.installed) return
      setSelectedId(modelId)
      if (kind === "chat") await handleUseChat(item)
      else await handleUseEmbedding(item)
    },
    [items, kind, handleUseChat, handleUseEmbedding]
  )

  const useSelected = useCallback(async () => {
    if (!selectedId) return
    await switchToModel(selectedId)
  }, [selectedId, switchToModel])

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
    embeddingLoadingId,
    isRefreshing,
    refresh,
    handleDownload,
    handleDelete,
    handleUseChat,
    handleUseEmbedding,
    useSelected,
    switchToModel,
    selectAdjacent,
  }
}
