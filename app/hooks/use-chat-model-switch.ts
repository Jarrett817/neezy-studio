import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  getModelCatalog,
  type ModelCatalogItem,
} from "~/services/electron-client"
import {
  isChatModelRunning,
  startChatModel,
  stopChatModel,
} from "~/services/model-runtime"
import { getRuntimeSettings } from "~/services/settings"
import {
  getCurrentModel,
  getLoadingState,
  isElectronLlmAvailable,
  subscribeLoadingState,
} from "~/services/llm"

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
    staleTime: 0,
    refetchOnWindowFocus: true,
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

  const toggleRun = useCallback(
    async (item: ModelCatalogItem) => {
      if (!isElectronLlmAvailable()) {
        toast.error("请使用 Electron 启动应用以加载本地模型")
        return
      }
      if (loading.isLoading) return

      try {
        if (isChatModelRunning(item.fileName)) {
          await stopChatModel(item.fileName)
          setChatFile(getCurrentModel())
          queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
          toast.success(`已关闭：${item.title}`)
        } else {
          await startChatModel(item)
          setChatFile(item.fileName)
          queryClient.invalidateQueries({ queryKey: ["runtime-settings"] })
          toast.success(`已启动：${item.title}`)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败")
      }
    },
    [loading.isLoading, queryClient]
  )

  return {
    catalog,
    installed,
    activeFileName,
    activeItem,
    loading,
    isRunning: (fileName: string) => isChatModelRunning(fileName),
    toggleRun,
  }
}
