import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { getAgentsMd, saveAgentsMd } from "~/services/electron-client"

export default function AgentsMdRoute() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["agents-md"],
    queryFn: getAgentsMd,
  })
  const [draft, setDraft] = useState("")
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data && !dirty) {
      setDraft(data.content)
    }
  }, [data, dirty])

  const saveMutation = useMutation({
    mutationFn: () => saveAgentsMd(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agents-md"] })
      setDirty(false)
      toast.success("已保存", {
        description: "Pi 将在下一轮对话加载；已断开当前 Agent 会话以刷新。",
      })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  })

  if (isLoading || !data) {
    return <p className="pt-4 text-sm text-muted-foreground">加载中…</p>
  }

  const displayPath = data.path.replace(/\\/g, "/")

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pt-4">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">AGENTS.md</h2>
          <p className="text-sm text-muted-foreground">
            Pi 跨会话持久说明，写入每轮 system 的
            project_context（与单次对话无关）。
          </p>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {displayPath}
          </p>
        </div>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setDirty(true)
        }}
        className="min-h-[min(420px,50vh)] flex-1 resize-y font-mono text-sm leading-relaxed"
        placeholder="例如：回答用中文；常用工具偏好；项目约定…"
      />

      <div className="flex shrink-0 items-center gap-2">
        <Button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          保存
        </Button>
        {dirty ? (
          <span className="text-xs text-muted-foreground">有未保存修改</span>
        ) : null}
      </div>
    </div>
  )
}
