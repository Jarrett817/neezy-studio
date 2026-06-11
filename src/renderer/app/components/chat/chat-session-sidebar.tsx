import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { History, MessageSquarePlus, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import { formatSessionTime } from "~/lib/format-session-time"
import { cn } from "~/lib/utils"
import {
  ensureActivePiChatSession,
  listPiChatSessions,
  removePiChatSession,
  sessionListPreview,
  sessionListTitle,
  startNewPiChatSession,
} from "~/services/pi-chat-sessions"

export function ChatSessionSidebar({
  activeSessionId,
  onSelectSession,
  onSessionCreated,
}: {
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onSessionCreated: (sessionId: string) => void
}) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["chat-sessions", "sidebar"],
    queryFn: listPiChatSessions,
  })

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.toLowerCase()
    return sessions.filter((s) => {
      const title = sessionListTitle(s).toLowerCase()
      const preview = (sessionListPreview(s) ?? "").toLowerCase()
      return title.includes(q) || preview.includes(q)
    })
  }, [sessions, query])

  const newSessionMutation = useMutation({
    mutationFn: () => startNewPiChatSession(),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
      onSessionCreated(session.id)
      setOpen(false)
      toast.success("已新建对话")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "新建失败")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => removePiChatSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      await queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
      await queryClient.invalidateQueries({
        queryKey: ["chat-sessions", "with-messages"],
      })
      const session = await ensureActivePiChatSession()
      onSelectSession(session.id)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除失败")
    },
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground/60 hover:bg-accent/30 hover:text-foreground"
          aria-label="历史对话"
        >
          <History className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-r-border/30 p-0">
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle className="font-heading text-sm">历史对话</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-[calc(100%-3.5rem)]">
          <div className="border-b border-border/60 p-3 space-y-2">
            <Button
              type="button"
              className="h-10 w-full justify-start gap-2 rounded-xl"
              disabled={newSessionMutation.isPending}
              onClick={() => newSessionMutation.mutate()}
            >
              <MessageSquarePlus className="size-4" />
              新对话
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 rounded-lg pl-8 text-xs"
                placeholder="搜索对话…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">加载历史…</p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                {query.trim() ? "无匹配对话" : "暂无历史对话"}
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((session) => {
                  const active = session.id === activeSessionId
                  const timeLabel = formatSessionTime(session.modified)
                  return (
                    <li key={session.id}>
                      <div
                        className={cn(
                          "group flex items-start gap-1 rounded-xl border border-transparent px-2 py-2 transition-colors",
                          active
                            ? "border-primary/30 bg-primary/10"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            onSelectSession(session.id)
                            setOpen(false)
                          }}
                        >
                          <p className="truncate text-sm font-medium">
                            {sessionListTitle(session)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {sessionListPreview(session) || timeLabel || "—"}
                          </p>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 opacity-0 group-hover:opacity-100"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(session.id)}
                          aria-label="删除对话"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
