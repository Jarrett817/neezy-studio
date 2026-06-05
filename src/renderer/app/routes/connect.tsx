import { useQuery } from "@tanstack/react-query"
import { Loader2, PlugZap } from "lucide-react"
import { useEffect, useRef } from "react"

import { ConnectStatusHero } from "~/components/connect/connect-status-hero"
import { ModelListPanel } from "~/components/connect/model-list-panel"
import {
  getRuntimeSettings,
  pushRuntimeSettingsToMain,
} from "~/services/settings"

export default function ConnectRoute() {
  const syncedMainRef = useRef(false)

  const { data: runtimeSettings, isLoading } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
    staleTime: 0,
  })

  useEffect(() => {
    if (!runtimeSettings || syncedMainRef.current) return
    syncedMainRef.current = true
    void pushRuntimeSettingsToMain()
  }, [runtimeSettings])

  if (isLoading || !runtimeSettings) {
    return (
      <div className="flex justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        加载中…
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 pt-2 pb-8">
      <header className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <PlugZap className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">模型与连接</h1>
        </div>
      </header>

      <ConnectStatusHero />

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <ModelListPanel />
      </section>
    </div>
  )
}
