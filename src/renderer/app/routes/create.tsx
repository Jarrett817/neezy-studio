import { useQuery } from "@tanstack/react-query"
import { Plus, Wand2 } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { ensurePlaybookDirs, listPlaybooks } from "~/services/playbook"

export default function CreateRoute() {
  const { data: playbooks = [], isLoading, isError, error } = useQuery({
    queryKey: ["playbooks"],
    queryFn: async () => {
      await ensurePlaybookDirs()
      return listPlaybooks()
    },
  })

  const runnable = playbooks.filter((p) => p.id !== "playbook-designer")
  const designer = playbooks.find((p) => p.id === "playbook-designer")

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">创作任务</p>
          <h1 className="text-2xl font-semibold tracking-tight">选择场景</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            组合 Skill、记忆与输入模板，一次生成可交付结果。
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 shrink-0 rounded-2xl px-5">
          <Link to="/chat">对话历史</Link>
        </Button>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载场景失败"}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">加载场景…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {runnable.map((playbook) => (
            <Card
              key={playbook.id}
              className="rounded-2xl border border-border/60 bg-card shadow-sm"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{playbook.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {playbook.description}
                </p>
                <Button asChild className="h-12 w-full rounded-2xl text-base">
                  <Link to={`/chat?playbook=${encodeURIComponent(playbook.id)}`}>
                    开始创作
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {designer ? (
        <Card className="rounded-2xl border border-dashed border-border/60 bg-muted/30 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10">
                <Wand2 className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{designer.name}</p>
                <p className="text-xs text-muted-foreground">{designer.description}</p>
              </div>
            </div>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/studio/playbook-designer">
                <Plus className="mr-1 size-4" />
                对话创建场景
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
