import { useQuery } from "@tanstack/react-query"
import { Cloud, Cpu, Link2, Unplug } from "lucide-react"

import { MODEL_TIER_META } from "~/config/model-tiers"
import { entryDisplayName, isEntryConfigured } from "~/config/chat-models"
import { cn } from "~/lib/utils"
import { getOllamaStatus } from "~/services/electron-client"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
  resolveTierForChat,
} from "~/services/settings"

export function ConnectStatusHero() {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: ollama } = useQuery({
    queryKey: ["ollama-status"],
    queryFn: getOllamaStatus,
    refetchInterval: 20_000,
  })

  const enabledCount =
    settings?.chatModels.filter(
      (m) => m.enabled && isEntryConfigured(m, settings.llmProvider)
    ).length ?? 0
  const apiReady =
    settings?.chatModels.some(
      (m) =>
        m.transport === "openai-compatible" &&
        m.enabled &&
        isEntryConfigured(m, settings.llmProvider)
    ) ?? false
  const ollamaReady = ollama?.connected === true

  const preview =
    settings && enabledCount > 0
      ? (() => {
          const tier = resolveTierForChat(settings, "预览")
          const entry = resolveChatModelEntry(settings, "预览")
          return entry
            ? `${settings.chatTierMode === "auto" ? "自动选档" : "固定"} · ${MODEL_TIER_META[tier].label} · ${entryDisplayName(entry)}`
            : "请为各档位至少配置一条完整模型"
        })()
      : "尚未添加模型"

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        已就绪 <span className="font-medium text-foreground">{enabledCount}</span>{" "}
        条 · 下次对话预计：{" "}
        <span className="font-medium text-foreground">{preview}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <HealthChip
          icon={apiReady ? Cloud : Unplug}
          label="Coding Plan"
          ok={apiReady}
          detail={apiReady ? "至少一条已配 Key" : "请添加并填写 Key"}
        />
        <HealthChip
          icon={ollamaReady ? Link2 : Unplug}
          label="Ollama"
          ok={ollamaReady}
          detail={ollama?.host?.replace(/^https?:\/\//, "") ?? "未连接"}
        />
      </div>
    </div>
  )
}

function HealthChip({
  icon: Icon,
  label,
  ok,
  detail,
}: {
  icon: typeof Cloud
  label: string
  ok: boolean
  detail: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        ok ? "border-border/60 bg-card" : "border-border/40 bg-muted/30"
      )}
    >
      <Icon className={cn("size-4 shrink-0", ok ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
