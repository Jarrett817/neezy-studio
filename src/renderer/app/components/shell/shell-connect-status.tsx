import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { PlugZap } from "lucide-react"

import { cn } from "~/lib/utils"
import { isModelLoaded } from "~/services/llm"
import { getRuntimeSettings } from "~/services/settings"

export function ShellConnectStatus() {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 10_000,
  })

  const isApi = settings?.llmProvider.kind === "openai-compatible"
  const connected = isApi
    ? Boolean(settings?.llmProvider.apiKey.trim() && settings.llmProvider.model.trim())
    : isModelLoaded()

  return (
    <Link
      to="/connect"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors",
        connected
          ? "border-border/60 bg-card text-foreground shadow-sm hover:bg-muted/50"
          : "border-border/60 bg-muted/40 text-muted-foreground shadow-sm hover:bg-muted/60"
      )}
    >
      <PlugZap className={cn("size-4 shrink-0", connected ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 leading-snug">
        {connected ? (
          <>
            <span className="block font-medium">AI 已连接</span>
            <span className="block truncate text-[11px] opacity-80">
              {isApi ? settings?.llmProvider.model : "本机 Ollama"}
            </span>
          </>
        ) : (
          <>
            <span className="block font-medium">AI 未连接</span>
            <span className="block text-[11px] opacity-80">点击配置</span>
          </>
        )}
      </span>
    </Link>
  )
}
