import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Feather, Scale, Zap } from "lucide-react"

import { MODEL_TIER_META, MODEL_TIERS } from "~/config/model-tiers"
import { cn } from "~/lib/utils"
import {
  getRuntimeSettings,
  pushRuntimeSettingsToMain,
  saveRuntimeSettings,
  type ChatTierMode,
  type ModelTier,
} from "~/services/settings"

const TIER_ICONS = {
  feather: Feather,
  scale: Scale,
  zap: Zap,
} as const

export function ChatTierPicker({ disabled }: { disabled?: boolean }) {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 0,
  })

  const mode = settings?.chatTierMode ?? "auto"
  const fixedTier = settings?.chatTier || "balanced"

  const applyMutation = useMutation({
    mutationFn: async (next: { mode: ChatTierMode; tier?: ModelTier }) => {
      const prev = await getRuntimeSettings()
      const saved = await saveRuntimeSettings({
        ...prev,
        chatTierMode: next.mode,
        chatTier: next.mode === "fixed" && next.tier ? next.tier : "",
      })
      await pushRuntimeSettingsToMain()
      return saved
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["runtime-settings"], saved)
    },
  })

  const isActive = (nextMode: ChatTierMode, tier?: ModelTier) =>
    nextMode === "auto"
      ? mode === "auto"
      : mode === "fixed" && fixedTier === tier

  const apply = (nextMode: ChatTierMode, tier?: ModelTier) => {
    if (disabled || applyMutation.isPending) return
    if (isActive(nextMode, tier)) return
    applyMutation.mutate({ mode: nextMode, tier })
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label="对话档位"
    >
      <span className="mr-0.5 text-xs text-muted-foreground">档位</span>
      <button
        type="button"
        disabled={disabled || applyMutation.isPending}
        onClick={() => apply("auto")}
        className={cn(
          "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
          isActive("auto")
            ? "bg-primary text-primary-foreground"
            : "bg-muted/80 text-muted-foreground hover:bg-muted"
        )}
      >
        自动
      </button>
      {MODEL_TIERS.map((tier) => {
        const meta = MODEL_TIER_META[tier]
        const Icon = TIER_ICONS[meta.icon]
        return (
          <button
            key={tier}
            type="button"
            disabled={disabled || applyMutation.isPending}
            title={meta.hint}
            onClick={() => apply("fixed", tier)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              isActive("fixed", tier)
                ? "bg-primary text-primary-foreground"
                : "bg-muted/80 text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="size-3 shrink-0" />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
