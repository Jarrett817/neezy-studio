import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { PlugZap } from "lucide-react"

import { getPresetLabel } from "~/config/llm-presets"
import { useCodingPlanCatalog } from "~/hooks/use-coding-plan-catalog"
import { cn } from "~/lib/utils"
import { getCurrentModel, isModelLoaded } from "~/services/llm"
import { getRuntimeSettings } from "~/services/settings"

export function ModelPill() {
  const { vendors } = useCodingPlanCatalog()
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const isApi = settings?.llmProvider.kind === "openai-compatible"
  const hasKey = Boolean(settings?.llmProvider.apiKey.trim())
  const modelName = isApi
    ? settings?.llmProvider.model.trim() || "未配置模型"
    : getCurrentModel() || settings?.llmModel || "未选择模型"
  const presetId = settings?.llmProvider.preset ?? "custom"
  const vendorLabel = isApi
    ? vendors.find((v) => v.id === presetId)?.label ?? getPresetLabel(presetId)
    : "本地 Ollama"
  const connected = isApi ? hasKey && Boolean(settings?.llmProvider.model.trim()) : isModelLoaded()
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
