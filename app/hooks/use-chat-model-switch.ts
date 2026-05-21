import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  getModelCatalog,
  type ModelCatalogItem,
} from "~/services/electron-client"
import { getRuntimeSettings, saveRuntimeSettings } from "~/services/settings"
import {
  getCurrentModel,
  getLoadingState,
  isElectronLlmAvailable,
  loadModel,
  subscribeLoadingState,
} from "~/services/llm"

const LAST_CHAT_MODEL_KEY = "neezy-llm-last-model"

export function useChatModelSwitch() {
  const queryClient = useQueryClient()
  const [chatFile, setChatFile] = useState(getCurrentModel)
  const [loading, setLoading] = useState(getLoadingState)

  useEffect(() => {
    return subscribeLoadingState((next) => {
      setLoading(next)
      if (!next.isLoading) setChatFile(getCurrentModel())
    })
  }, [])

  const { data: catalog = [] } = useQuery({
    queryKey: ["model-catalog", "chat"],
    queryFn: () => getModelCatalog("chat"),
    staleTime: 15_000,
  })

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const activeFileName = chatFile ?? settings?.llmModel ?? null
  const installed = catalog.filter((m) => m.installed)
  const activeItem =
    installed.find((m) => m.fileName === activeFileName) ??
    catalog.find((m) => m.fileName === activeFileName) ??
    null

  const switchTo = useCallback(
    async (item: ModelCatalogItem) => {
      if (!isElectronLlmAvailable()) {
        toast.error("请使用 Electron 启动应用以加载本地模型")
        return
      }
      if (item.fileName === activeFileName && !loading.isLoading) return

      try {
        await loadModel(item.fileName)
        localStorage.setItem(LAST_CHAT_MODEL_KEY, item.fileName)
        const nextSettings = await getRuntimeSettings()
        await saveRuntimeSettings({
          ...nextSettings,
          llmModel: item.fileName,
          chatTier: item.tier,
        })
        setChatFile(item.fileName)
        queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
        toast.success(`已切换：${item.title}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "模型加载失败")
      }
    },
    [activeFileName, loading.isLoading, queryClient]
  )

  return {
    catalog,
    installed,
    activeFileName,
    activeItem,
    loading,
    switchTo,
  }
}
