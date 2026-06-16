import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Clapperboard, MessageSquare, Plus, Sparkles } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { sceneChatPath } from "~/lib/scene-chat-nav"
import { loadInputSceneSlots } from "~/services/playbook/extract-slots"
import { ensurePlaybookDirs, listPlaybooks } from "~/services/playbook"
import {
  listPiChatSessionsWithMessages,
  sessionListTitle,
} from "~/services/pi-chat-sessions"

export default function WorkbenchRoute() {
  const { data: playbooks = [] } = useQuery({
    queryKey: ["playbooks"],
    queryFn: async () => {
      await ensurePlaybookDirs()
      return listPlaybooks()
    },
  })

  const { data: continuePlaybook } = useQuery({
    queryKey: ["playbook-continue-draft", playbooks.map((p) => p.id).join(",")],
    queryFn: async () => {
      for (const playbook of playbooks.filter((p) => p.id !== "playbook-designer")) {
        if (await loadInputSceneSlots(playbook.inputProfileId)) return playbook
      }
      return null
    },
    enabled: playbooks.length > 0,
  })

  const { data: chatSessions = [] } = useQuery({
    queryKey: ["chat-sessions", "with-messages"],
    queryFn: listPiChatSessionsWithMessages,
  })

  const runnable = playbooks.filter((p) => p.id !== "playbook-designer").slice(0, 4)
  const recentChats = chatSessions.slice(0, 3)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 py-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            本地 Agent 工作室
          </div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground/95">
            从一个场景开始今天的工作
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            选择可复用场景，填入参数或白板草图，Neezy 会为它创建专属对话并持续迭代。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="h-12 rounded-2xl px-6 text-base">
              <Link to="/scenes">
                <Clapperboard className="size-4" />
                进入场景库
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-2xl px-6 text-base">
              <Link to="/scenes/designer">
                <Plus className="size-4" />
                创建场景
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {continuePlaybook ? (
        <section>
          <p className="mb-3 text-sm font-medium text-muted-foreground">继续填写</p>
          <Link
            to={sceneChatPath(continuePlaybook.id)}
            className="flex items-center justify-between rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm transition hover:border-primary/25 hover:bg-card"
          >
            <div>
              <p className="font-heading text-base font-semibold">{continuePlaybook.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">保留了上次填写内容</p>
            </div>
            <ArrowRight className="size-5 text-muted-foreground" />
          </Link>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-semibold tracking-tight">推荐场景</h2>
            <p className="mt-1 text-sm text-muted-foreground">把高频任务变成稳定工作流</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="rounded-xl">
            <Link to="/scenes">全部场景</Link>
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {runnable.map((playbook) => (
            <Card key={playbook.id} className="group overflow-hidden rounded-3xl border-border/60 bg-card/70 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
              <CardContent className="flex h-full flex-col p-5">
                <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Clapperboard className="size-5" />
                </div>
                <p className="font-heading font-semibold leading-snug">{playbook.name}</p>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{playbook.description}</p>
                <Button asChild className="mt-5 h-10 rounded-xl">
                  <Link to={sceneChatPath(playbook.id)}>运行</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {recentChats.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-muted-foreground">最近对话</h2>
          <div className="grid gap-2">
            {recentChats.map((session) => (
              <Link
                key={session.id}
                to={`/chat?session=${encodeURIComponent(session.id)}`}
                className="flex min-h-12 items-center justify-between rounded-2xl border border-border/50 bg-card/50 px-4 text-sm transition hover:bg-card"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{sessionListTitle(session)}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
