import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { getModelCatalog, type ModelCatalogItem } from "~/services/electron-client"
import { getRuntimeSettings } from "~/services/settings"
import {
  getCurrentModel,
  getLoadingState,
  isModelLoaded,
  subscribeLoadingState,
} from "~/services/llm"

export type ActiveModelChip = {
  label: string
  status: "ready" | "loading" | "idle"
}

function displayName(
  fileName: string | null | undefined,
  catalog: ModelCatalogItem[] | undefined
) {
  if (!fileName) return null
  const item = catalog?.find((m) => m.fileName === fileName)
  if (item?.title) return item.title
  return fileName.replace(/\.gguf$/i, "")
}

function chatStatus(
  loading: ReturnType<typeof getLoadingState>,
  hasFile: boolean
): ActiveModelChip["status"] {
  if (loading.isLoading) return "loading"
  if (isModelLoaded() && hasFile) return "ready"
  return "idle"
}

export function useActiveModels() {
  const [chatFile, setChatFile] = useState(getCurrentModel)
  const [loading, setLoading] = useState(getLoadingState)

  useEffect(() => {
    return subscribeLoadingState((next) => {
      setLoading(next)
      if (!next.isLoading) setChatFile(getCurrentModel())
    })
  }, [])

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const { data: chatCatalog = [] } = useQuery({
    queryKey: ["model-catalog", "chat"],
    queryFn: () => getModelCatalog("chat"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const { data: embeddingCatalog = [] } = useQuery({
    queryKey: ["model-catalog", "embedding"],
    queryFn: () => getModelCatalog("embedding"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const isApi = settings?.llmProvider.kind === "openai-compatible"
  const chatFileName = chatFile ?? settings?.llmModel ?? null
  const embFileName = settings?.embeddingModel ?? null

  const chat: ActiveModelChip = isApi
    ? {
        label: settings.llmProvider.model.trim() || "未配置",
        status: settings.llmProvider.apiKey.trim() ? "ready" : "idle",
      }
    : {
        label: displayName(chatFileName, chatCatalog) ?? "未选择",
        status: chatStatus(loading, Boolean(chatFileName)),
      }

  const embedding: ActiveModelChip = {
    label: displayName(embFileName, embeddingCatalog) ?? "未配置",
    status: embFileName ? "idle" : "idle",
  }

  return { chat, embedding }
}
