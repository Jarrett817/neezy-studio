import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MessageSquarePlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
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

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["chat-sessions", "sidebar"],
    queryFn: listPiChatSessions,
  })

  const newSessionMutation = useMutation({
    mutationFn: () => startNewPiChatSession(),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions", "sidebar"] })
      onSessionCreated(session.id)
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
    <aside className="flex w-56 shrink-0 flex-col border-r border-border/60 bg-card">
      <div className="border-b border-border/60 p-3">
        <Button
          type="button"
          className="h-10 w-full justify-start gap-2 rounded-xl"
          disabled={newSessionMutation.isPending}
          onClick={() => newSessionMutation.mutate()}
        >
          <MessageSquarePlus className="size-4" />
          新对话
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">加载历史…</p>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">暂无历史对话</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
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
                      onClick={() => onSelectSession(session.id)}
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
    </aside>
  )
}
