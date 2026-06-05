import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router"

import { entryDisplayName, isEntryConfigured } from "~/config/chat-models"
import { useActiveModels } from "~/hooks/use-active-models"
import { cn } from "~/lib/utils"
import { getRuntimeSettings, resolveChatModelEntry } from "~/services/settings"

export function ChatModelStatus({ className }: { className?: string }) {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })
  const { chat } = useActiveModels()
  const entry = settings ? resolveChatModelEntry(settings) : null
  const ready = entry && settings ? isEntryConfigured(entry, settings.llmProvider) : false

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="truncate">
        对话 ·{" "}
        <span className="font-medium text-foreground">
          {entry ? entryDisplayName(entry) : chat.label}
        </span>
        {!ready ? "（未就绪）" : null}
      </span>
      <Link
        to="/connect"
        className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground hover:underline"
      >
        {ready ? "模型与连接" : "去配置模型"}
        <ArrowRight className="size-3" />
      </Link>
    </div>
  )
}
