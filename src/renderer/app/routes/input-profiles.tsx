import { useQuery } from "@tanstack/react-query"
import { FileInput, ArrowLeft } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { listInputProfiles } from "~/services/playbook"

export default function InputProfilesRoute() {
  const { data: profiles = [], isLoading, isError, error } = useQuery({
    queryKey: ["input-profiles"],
    queryFn: listInputProfiles,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-4">
      <Button asChild variant="ghost" size="sm" className="gap-2 rounded-xl">
        <Link to="/studio">
          <ArrowLeft className="size-4" />
          工作室
        </Link>
      </Button>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <FileInput className="size-3.5" />
          输入模板
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          输入模板
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          定义场景要问用户什么、以及如何编译成发给模型的 prompt。
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载失败"}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <Card key={profile.id} className="rounded-2xl border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-mono">{profile.id}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  字段：{profile.fields.map((f) => f.label).join("、")}
                </p>
                <p className="line-clamp-2 font-mono text-xs">
                  {profile.promptTemplate.slice(0, 120)}…
                </p>
                <Button asChild variant="outline" size="sm" className="rounded-xl">
                  <Link to={`/studio/input-profiles/${profile.id}`}>查看 / 编辑</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
