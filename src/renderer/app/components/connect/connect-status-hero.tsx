import { useQuery } from "@tanstack/react-query"
import { Cloud, Unplug } from "lucide-react"

import { entryDisplayName, isEntryConfigured } from "~/config/chat-models"
import { cn } from "~/lib/utils"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"

export function ConnectStatusHero() {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })

  const enabledCount =
    settings?.chatModels.filter(
      (m) => m.enabled && isEntryConfigured(m, settings.llmProvider)
    ).length ?? 0
  const apiReady =
    settings?.chatModels.some(
      (m) => m.enabled && isEntryConfigured(m, settings.llmProvider)
    ) ?? false

  const activeEntry = settings ? resolveChatModelEntry(settings) : null
  const preview =
    settings && enabledCount > 0
      ? activeEntry
        ? entryDisplayName(activeEntry)
        : "请指定一条已启用的完整模型"
      : "尚未添加模型"

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        已就绪 <span className="font-medium text-foreground">{enabledCount}</span>{" "}
        条 · 下次对话预计：{" "}
        <span className="font-medium text-foreground">{preview}</span>
      </p>
      <HealthChip
        icon={apiReady ? Cloud : Unplug}
        label="API 连接"
        ok={apiReady}
        detail={apiReady ? "至少一条已配 Key" : "请添加并填写 Key"}
      />
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
