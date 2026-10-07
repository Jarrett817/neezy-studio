import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileJson2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { JsonCodeEditor } from "~/components/json-code-editor"
import { Button } from "~/components/ui/button"
import { getElectronApi } from "~/services/electron-client"

async function getMcpJson(): Promise<{ path: string; content: string }> {
  return getElectronApi().getMcpJson()
}

async function saveMcpJson(content: string): Promise<{ ok: boolean }> {
  return getElectronApi().saveMcpJson(content)
}

function tryFormatJson(raw: string): string | null {
  try {
    return `${JSON.stringify(JSON.parse(raw), null, 2)}\n`
  } catch {
    return null
  }
}

export default function McpRoute() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["mcp-json"],
    queryFn: getMcpJson,
  })
  const [draft, setDraft] = useState("")
  const [dirty, setDirty] = useState(false)
  const formatTimerRef = useRef<number | null>(null)
  const formattingRef = useRef(false)
  const initialLoadRef = useRef(false)

  useEffect(() => {
    if (!data || dirty) return
    initialLoadRef.current = true
    setDraft(data.content)
    const formatted = tryFormatJson(data.content)
    if (formatted && formatted !== data.content) {
      formattingRef.current = true
      setDraft(formatted)
      setDirty(true)
      formattingRef.current = false
    }
    initialLoadRef.current = false
  }, [data, dirty]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleFormat = (value: string) => {
    if (formattingRef.current) return
    if (formatTimerRef.current) {
      window.clearTimeout(formatTimerRef.current)
    }
    formatTimerRef.current = window.setTimeout(() => {
      formatTimerRef.current = null
      const formatted = tryFormatJson(value)
      if (!formatted || formatted === value) return
      formattingRef.current = true
      setDraft(formatted)
      formattingRef.current = false
    }, 600)
  }

  useEffect(() => {
    return () => {
      if (formatTimerRef.current) {
        window.clearTimeout(formatTimerRef.current)
      }
    }
  }, [])

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

      <JsonCodeEditor
        value={draft}
        onChange={(value) => {
          if (formattingRef.current) return
          setDraft(value)
          if (!initialLoadRef.current) {
            setDirty(true)
          }
          scheduleFormat(value)
        }}
        className="flex-1 min-h-0"
        minHeight="min(420px,50vh)"
      />

      <div className="flex shrink-0 items-center gap-2">
        <Button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "保存中…" : "保存"}
        </Button>
        {dirty ? (
          <span className="text-xs text-muted-foreground">有未保存修改</span>
        ) : null}
      </div>
    </div>
  )
}
