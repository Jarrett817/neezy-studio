import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"
import {
  type ContextUsageWire,
  formatContextUsageTooltip,
} from "../../../../shared/chat-wire"

const CONTEXT_RING_R = 6
const CONTEXT_RING_C = 2 * Math.PI * CONTEXT_RING_R

export function ContextUsageRing({ usage }: { usage: ContextUsageWire }) {
  const percent =
    usage.percent == null ? 0 : Math.min(100, Math.max(0, usage.percent))
  const known = usage.tokens != null && usage.percent != null
  const offset = CONTEXT_RING_C * (1 - percent / 100)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground/70 hover:bg-accent/30 hover:text-foreground"
            aria-label={formatContextUsageTooltip(usage)}
          >
            <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
              <circle
                cx="8"
                cy="8"
                r={CONTEXT_RING_R}
                fill="none"
                className="stroke-muted-foreground/25"
                strokeWidth="2"
              />
              <circle
                cx="8"
                cy="8"
                r={CONTEXT_RING_R}
                fill="none"
                className={cn(
                  "transition-[stroke-dashoffset]",
                  !known
                    ? "stroke-muted-foreground/40"
                    : percent >= 90
                      ? "stroke-destructive"
                      : percent >= 70
                        ? "stroke-amber-500"
                        : "stroke-primary"
                )}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={CONTEXT_RING_C}
                strokeDashoffset={known ? offset : CONTEXT_RING_C * 0.92}
              />
            </svg>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {formatContextUsageTooltip(usage)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
