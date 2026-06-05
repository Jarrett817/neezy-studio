import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { PlugZap } from "lucide-react"

import { entryDisplayName, isEntryConfigured } from "~/config/chat-models"
import { getPresetLabel } from "~/config/llm-presets"
import { useCodingPlanCatalog } from "~/hooks/use-coding-plan-catalog"
import { cn } from "~/lib/utils"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
} from "~/services/settings"

export function ModelPill() {
  const { vendors } = useCodingPlanCatalog()
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const entry = settings ? resolveChatModelEntry(settings) : null
  const modelName = entry
    ? entryDisplayName(entry)
    : settings?.llmProvider.model.trim() || "未配置模型"
  const presetId = entry?.preset ?? settings?.llmProvider.preset ?? "custom"
  const vendorLabel =
    vendors.find((v) => v.id === presetId)?.label ?? getPresetLabel(presetId)
  const connected = entry
    ? isEntryConfigured(entry, settings!.llmProvider)
    : false
  const label = `${modelName} · ${vendorLabel}`

  return (
    <Link
      to="/connect"
      title={label}
      className={cn(
        "inline-flex max-w-[min(100%,280px)] items-center gap-2 rounded-full border border-border/60",
        "bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted/60"
      )}
    >
      <PlugZap
        className={cn("size-3.5 shrink-0", connected ? "text-primary" : "text-muted-foreground")}
      />
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          connected ? "bg-green-500" : "bg-amber-500"
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </Link>
  )
}
