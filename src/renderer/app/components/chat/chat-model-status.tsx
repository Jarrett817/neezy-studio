import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Loader2 } from "lucide-react"
import { Link } from "react-router"

import { entryDisplayName } from "~/config/chat-models"
import { useActiveModels } from "~/hooks/use-active-models"
import { cn } from "~/lib/utils"
import { MODEL_TIER_META } from "~/config/model-tiers"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
  resolveTierForChat,
} from "~/services/settings"

export function ChatModelStatus({ className }: { className?: string }) {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })
  const { chat } = useActiveModels()
  const entry = settings ? resolveChatModelEntry(settings) : null
  const tier = settings ? resolveTierForChat(settings) : null
  const tierLabel = tier ? MODEL_TIER_META[tier].label : null
  const isApi = entry?.transport === "openai-compatible"

  if (isApi && entry) {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground",
          className
        )}
      >
        <span className="truncate">
          对话 · {tierLabel ? `${tierLabel} · ` : null}
          <span className="font-medium text-foreground">{entryDisplayName(entry)}</span>
        </span>
        <Link
          to="/connect"
          className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground hover:underline"
        >
          模型与连接
          <ArrowRight className="size-3" />
        </Link>
      </div>
    )
  }

  const needsSetup = chat.status !== "ready"

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 truncate",
          needsSetup ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {chat.status === "loading" ? (
          <Loader2 className="size-3 shrink-0 animate-spin" />
        ) : (
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              chat.status === "ready" ? "bg-emerald-500" : "bg-amber-500"
            )}
            aria-hidden
          />
        )}
        对话模型：{entry ? entryDisplayName(entry) : chat.label}
      </span>
      <Link
        to="/connect"
        className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground hover:underline"
      >
        {needsSetup ? "去配置模型" : "模型与连接"}
        <ArrowRight className="size-3" />
      </Link>
    </div>
  )
}
