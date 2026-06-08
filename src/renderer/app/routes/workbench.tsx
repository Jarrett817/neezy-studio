import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  LayoutGrid,
  MessageSquare,
  PlugZap,
  Sparkles,
} from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  SCENE_CHAT_LAUNCH_STATE,
  sceneChatPath,
} from "~/lib/scene-chat-nav"
import { loadInputSceneSlots } from "~/services/playbook/extract-slots"
import { ensurePlaybookDirs, listPlaybooks } from "~/services/playbook"
import {
  listPiChatSessionsWithMessages,
  sessionListTitle,
} from "~/services/pi-chat-sessions"
import { listMemories } from "~/services/memories"
import { isEntryConfigured } from "~/config/chat-models"
import {
  getRuntimeSettings,
  resolveChatModelEntry,
} from "~/services/settings"

function isAiConnected(settings: Awaited<ReturnType<typeof getRuntimeSettings>>): boolean {
  const entry = resolveChatModelEntry(settings)
  return entry ? isEntryConfigured(entry, settings.llmProvider) : false
}

export default function WorkbenchRoute() {
  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })

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
      const runnable = playbooks.filter((p) => p.id !== "playbook-designer")
      for (const playbook of runnable) {
        const slots = await loadInputSceneSlots(playbook.inputProfileId)
        if (slots) return playbook
      }
      return null
    },
    enabled: playbooks.length > 0,
  })

  const { data: chatSessions = [] } = useQuery({
    queryKey: ["chat-sessions", "with-messages"],
    queryFn: listPiChatSessionsWithMessages,
  })

  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: listMemories,
  })

  const runnable = playbooks.filter((p) => p.id !== "playbook-designer")
  const recentChats = chatSessions.slice(0, 3)

  const latestChat = chatSessions[0]
  const continueTarget = continuePlaybook
    ? { type: "playbook" as const, id: continuePlaybook.id, label: continuePlaybook.name }
    : latestChat
      ? {
          type: "chat" as const,
          id: latestChat.id,
          label: sessionListTitle(latestChat),
        }
      : null

  const connected = settings ? isAiConnected(settings) : true
  const showStats = chatSessions.length > 0 || memories.length > 0

  return (
    <div className="w-full space-y-8 pt-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Sparkles className="size-4" />
          <span className="text-xs font-medium">工作台</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">今天想创作什么？</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          选场景生成内容，或在对话中与 AI 持续协作；历史对话自动保存。
        </p>
      </div>

      {settings && !connected ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-200/80 bg-amber-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <PlugZap className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-950 dark:text-amber-100">尚未连接 AI</p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                配置 Coding Plan 或 API Key 后即可开始生成。
              </p>
            </div>
          </div>
          <Button asChild className="h-12 shrink-0 rounded-2xl px-6 text-base">
            <Link to="/connect">去配置 AI</Link>
          </Button>
        </div>
      ) : null}

      {continueTarget ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">继续上次</h2>
          <Card className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <p className="font-medium">{continueTarget.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {continueTarget.type === "chat"
                    ? "打开最近对话"
                    : "保留上次填写内容"}
                </p>
              </div>
              <Button asChild className="h-12 rounded-2xl px-6">
                <Link
                  to={
                    continueTarget.type === "chat"
                      ? `/chat?session=${encodeURIComponent(continueTarget.id)}`
                      : sceneChatPath(continueTarget.id)
                  }
                  state={
                    continueTarget.type === "playbook" ? SCENE_CHAT_LAUNCH_STATE : undefined
                  }
                >
                  继续
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">推荐场景</h2>
          <Button asChild variant="ghost" size="sm" className="rounded-xl">
            <Link to="/scenes">全部</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {runnable.map((playbook) => (
            <Card
              key={playbook.id}
              className="rounded-2xl border border-border/60 bg-card shadow-sm"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <LayoutGrid className="size-4 text-primary" />
                  {playbook.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {playbook.description}
                </p>
                <Button asChild className="h-12 w-full rounded-2xl">
                  <Link to={sceneChatPath(playbook.id)} state={SCENE_CHAT_LAUNCH_STATE}>
                    开始创作
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {runnable.length === 0 ? (
          <Button asChild className="h-12 rounded-2xl">
            <Link to="/scenes">去选创作任务</Link>
          </Button>
        ) : null}
      </section>

      {recentChats.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">最近对话</h2>
            <Button asChild variant="ghost" size="sm" className="rounded-xl">
              <Link to="/chat">全部对话</Link>
            </Button>
          </div>
          <ul className="space-y-2">
            {recentChats.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/chat?session=${encodeURIComponent(session.id)}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm shadow-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{sessionListTitle(session)}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showStats ? (
        <section className="grid grid-cols-2 gap-3">
          {chatSessions.length > 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <p className="text-2xl font-semibold tabular-nums">{chatSessions.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">对话</p>
            </div>
          ) : null}
          {memories.length > 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <p className="text-2xl font-semibold tabular-nums">{memories.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">记忆素材</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
