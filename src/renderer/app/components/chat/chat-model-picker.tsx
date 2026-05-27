import { Link, useNavigate } from "react-router"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "~/components/ui/button"

import { useChatModelSwitch } from "~/hooks/use-chat-model-switch"
import { useActiveModels } from "~/hooks/use-active-models"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cn } from "~/lib/utils"

const MANAGE_VALUE = "__manage_models__"

export function ChatModelPicker({
  disabled,
  className,
}: {
  disabled?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const { chat } = useActiveModels()
  const { installed, activeFileName, loading, toggleRun } = useChatModelSwitch()
  const isLoading = loading.isLoading
  const busy = disabled || isLoading

  const selectValue =
    activeFileName && installed.some((m) => m.fileName === activeFileName)
      ? activeFileName
      : undefined

  if (installed.length === 0) {
    return (
      <Button
        asChild
        variant="outline"
        size="sm"
        className={cn(
          "h-auto rounded-full px-2.5 py-1 text-xs",
          className
        )}
      >
        <Link to="/models">
          <Sparkles className="mr-1 inline size-3 opacity-70" />
          下载对话模型
        </Link>
      </Button>
    )
  }

  return (
    <Select
      value={selectValue}
      onValueChange={(value) => {
        if (value === MANAGE_VALUE) {
          navigate("/models")
          return
        }
        const item = installed.find((m) => m.fileName === value)
        if (item) void toggleRun(item)
      }}
      disabled={busy}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "h-auto max-w-[min(100%,18rem)] gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-none",
          chat.status === "ready" &&
            "border-emerald-500/25 bg-emerald-500/8 text-foreground",
          chat.status === "loading" &&
            "border-primary/25 bg-primary/8 text-foreground",
          chat.status === "idle" &&
            "border-border/50 bg-muted/40 text-muted-foreground",
          className
        )}
      >
        <Sparkles className="size-3 shrink-0 opacity-70" />
        {isLoading ? (
          <span className="flex items-center gap-1.5 truncate font-medium">
            <Loader2 className="size-3 animate-spin text-primary" />
            加载中…
          </span>
        ) : (
          <SelectValue placeholder="选择对话模型" />
        )}
      </SelectTrigger>
      <SelectContent align="start" className="max-h-72">
        <SelectGroup>
          <SelectLabel>对话模型</SelectLabel>
          {installed.map((item) => (
            <SelectItem key={item.id} value={item.fileName}>
              {`${item.title} · ${item.tierLabel}`}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectItem value={MANAGE_VALUE}>管理模型…</SelectItem>
      </SelectContent>
    </Select>
  )
}
