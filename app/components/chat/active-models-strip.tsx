import { Link } from "react-router"
import { Brain, Loader2, Sparkles } from "lucide-react"

import { ChatModelPicker } from "~/components/chat/chat-model-picker"
import {
  useActiveModels,
  type ActiveModelChip,
} from "~/hooks/use-active-models"
import { cn } from "~/lib/utils"

function ModelPill({
  icon: Icon,
  kind,
  model,
}: {
  icon: typeof Sparkles
  kind: string
  model: ActiveModelChip
}) {
  return (
    <Link
      to="/models"
      className={cn(
        "inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        "hover:border-primary/30 hover:bg-primary/5",
        model.status === "ready" &&
          "border-emerald-500/25 bg-emerald-500/8 text-foreground",
        model.status === "loading" &&
          "border-primary/25 bg-primary/8 text-foreground",
        model.status === "idle" &&
          "border-border/50 bg-muted/40 text-muted-foreground"
      )}
      title={`${kind}：${model.label}`}
    >
      <Icon className="size-3 shrink-0 opacity-70" />
      <span className="shrink-0 text-muted-foreground">{kind}</span>
      <span className="truncate font-medium">{model.label}</span>
      {model.status === "loading" && (
        <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
      )}
      {model.status === "ready" && (
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
      )}
    </Link>
  )
}

export function ActiveModelsStrip({
  className,
  chatSelectable,
  chatPickerDisabled,
}: {
  className?: string
  chatSelectable?: boolean
  chatPickerDisabled?: boolean
}) {
  const { chat, embedding } = useActiveModels()

  return (
    <div
      className={cn("flex shrink-0 flex-wrap items-center gap-1.5", className)}
    >
      {chatSelectable ? (
        <ChatModelPicker disabled={chatPickerDisabled} />
      ) : (
        <ModelPill icon={Sparkles} kind="对话" model={chat} />
      )}
      <ModelPill icon={Brain} kind="记忆" model={embedding} />
    </div>
  )
}
