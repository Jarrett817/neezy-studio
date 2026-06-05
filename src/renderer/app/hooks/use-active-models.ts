import { useQuery } from "@tanstack/react-query"

import { entryDisplayName, isEntryConfigured } from "~/config/chat-models"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
} from "~/services/settings"

export type ActiveModelChip = {
  label: string
  status: "ready" | "loading" | "idle"
}

export function useActiveModels() {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const entry = settings ? resolveChatModelEntry(settings) : null

  const chat: ActiveModelChip = entry
    ? {
        label: entryDisplayName(entry),
        status: isEntryConfigured(entry, settings!.llmProvider) ? "ready" : "idle",
      }
    : { label: "未配置", status: "idle" }

  return { chat }
}
