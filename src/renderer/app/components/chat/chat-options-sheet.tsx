import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import type { ChatToolCall } from "~/lib/agent-steps"

export default function ChatOptionsSheet({
  open,
  toolCalls,
  onOpenChange,
}: {
  open: boolean
  toolCalls?: ChatToolCall[]
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-l-border/30 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading">对话选项</SheetTitle>
          <SheetDescription>工具 trace</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 px-1">
          {toolCalls?.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">工具 trace</p>
              <ul className="space-y-2 text-xs">
                {toolCalls.map((tc) => (
                  <li key={tc.toolCallId} className="rounded-xl border border-border/30 bg-background/50 p-2 font-mono">
                    <span className="font-sans font-medium text-foreground">{tc.name}</span>
                    {tc.result ? (
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
                        {tc.result.slice(0, 400)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
