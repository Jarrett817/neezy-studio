import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileJson2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { getElectronApi } from "~/services/electron-client"

async function getMcpJson(): Promise<{ path: string; content: string }> {
  return getElectronApi().getMcpJson()
}

async function saveMcpJson(content: string): Promise<{ ok: boolean }> {
  return getElectronApi().saveMcpJson(content)
}

export default function McpRoute() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["mcp-json"],
    queryFn: getMcpJson,
  })
  const [draft, setDraft] = useState("")
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data && !dirty) {
      setDraft(data.content)
    }
  }, [data, dirty])

  const saveMutation = useMutation({
    mutationFn: () => saveMcpJson(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mcp-json"] })
      setDirty(false)
      toast.success("已保存", {
        description: "新建对话后生效；已断开当前 Agent 会话以刷新。",
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
        <FileJson2 className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">mcp.json</h2>
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
        placeholder={`{\n  "mcpServers": {\n    "playwright": {\n      "command": "npx",\n      "args": ["@playwright/mcp@latest"]\n    }\n  }\n}`}
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
