import { Check, Pencil, Trash2, X } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"
import type { ChatMessage } from "~/stores/app-store"

const TiptapContent = lazy(() =>
  import("~/components/tiptap/TiptapContent").then((m) => ({
    default: m.TiptapContent,
  }))
)

export function QueuedUserMessage({
  message,
  onCancel,
  onSaveEdit,
}: {
  message: ChatMessage
  onCancel: (userId: string) => void
  onSaveEdit: (userId: string, content: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)

  const saveEdit = () => {
    const text = draft.trim()
    if (!text) return
    onSaveEdit(message.id, text)
    setEditing(false)
  }

  return (
    <div className="flex justify-end py-2">
      <div className="flex max-w-[78%] min-w-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary/80">
            排队中
          </span>
          {!editing ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 rounded-lg text-muted-foreground"
                aria-label="编辑"
                onClick={() => {
                  setDraft(message.content)
                  setEditing(true)
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 rounded-lg text-muted-foreground hover:text-destructive"
                aria-label="移出队列"
                onClick={() => onCancel(message.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 rounded-lg"
                aria-label="保存"
                onClick={saveEdit}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 rounded-lg"
                aria-label="取消编辑"
                onClick={() => setEditing(false)}
              >
                <X className="size-3.5" />
              </Button>
            </>
          )}
        </div>
        <div
          className={cn(
            "min-w-0 w-full overflow-hidden rounded-[20px] rounded-br-[16px] border border-dashed border-primary/35 bg-muted/30 px-4 py-2.5 text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] text-foreground/90 ring-1 ring-primary/10"
          )}
        >
          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-16 resize-none border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
            />
          ) : message.contentJson ? (
            <Suspense
              fallback={
                <div className="text-sm text-muted-foreground">
                  {message.content}
                </div>
              }
            >
              <TiptapContent
                doc={message.contentJson}
                className="min-w-0 break-words [overflow-wrap:anywhere] [&_*]:max-w-full"
              />
            </Suspense>
          ) : (
            <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {message.content}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
