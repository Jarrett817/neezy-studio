import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { getModelCatalog, type ModelCatalogItem } from "~/services/electron-client"
import { entryDisplayName, findOllamaChatEntry } from "~/config/chat-models"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
} from "~/services/settings"
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

  const entry = settings ? resolveChatModelEntry(settings) : null
  const isApi = entry?.transport === "openai-compatible"
  const ollamaModel = settings
    ? findOllamaChatEntry(settings.chatModels)?.model
    : undefined
  const chatFileName = chatFile ?? ollamaModel ?? null

  const chat: ActiveModelChip = entry
    ? isApi
      ? {
          label: entryDisplayName(entry),
          status: (entry.apiKey ?? settings?.llmProvider.apiKey)?.trim()
            ? "ready"
            : "idle",
        }
      : {
          label: entryDisplayName(entry),
          status: entry.model.trim() ? "ready" : "idle",
        }
    : {
        label: displayName(chatFileName, chatCatalog) ?? "未选择",
        status:
          chatFileName && (isModelLoaded() || !loading.isLoading)
            ? "ready"
            : chatStatus(loading, Boolean(chatFileName)),
      }

  return { chat }
}
