import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
import { getMcpConfig, saveMcpConfig, type McpServerDraft } from "~/services/mcp-config"
import { cn } from "~/lib/utils"

function emptyServer(): McpServerDraft {
  return {
    name: "",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    disabled: false,
  }
}

function envToText(env?: Record<string, string>): string {
  if (!env) return ""
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
}

function textToEnv(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const i = trimmed.indexOf("=")
    if (i <= 0) continue
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export default function McpRoute() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["mcp-config"],
    queryFn: getMcpConfig,
  })
  const [draft, setDraft] = useState<McpServerDraft[]>([])

  useEffect(() => {
    if (data) setDraft(data.servers.map((s) => ({ ...s })))
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => saveMcpConfig(draft),
    onSuccess: (saved) => {
      queryClient.setQueryData(["mcp-config"], saved)
      setDraft(saved.servers.map((s) => ({ ...s })))
      toast.success("MCP 配置已保存", {
        description: "已写入 mcp-adapter.json；新建对话后生效。",
      })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  })

  const updateAt = (index: number, patch: Partial<McpServerDraft>) => {
    setDraft((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  if (isLoading) {
    return <p className="pt-4 text-sm text-muted-foreground">加载中…</p>
  }

  return (
    <div className="w-full space-y-6 pt-4">
      <div>
        <h1 className="text-lg font-semibold">MCP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          通过 pi-mcp-adapter 连接 MCP 服务器（懒加载，代理工具约 200 token）。配置文件：
          <span className="ml-1 font-mono text-xs break-all">{data?.configPath}</span>
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setDraft((prev) => [...prev, emptyServer()])}
        >
          <Plus className="size-4" />
          添加服务器
        </Button>
      </div>

      {draft.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
          还没有 MCP 服务器。添加后 Agent 可通过 mcp 工具按需调用。
        </p>
      ) : (
        <ul className="space-y-3">
          {draft.map((server, index) => (
            <li
              key={index}
              className={cn(
                "space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
                server.disabled && "opacity-60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!server.disabled}
                    onCheckedChange={(on) => updateAt(index, { disabled: !on })}
                  />
                  <span className="text-xs text-muted-foreground">启用</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="删除"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">名称</Label>
                  <Input
                    className="h-9 font-mono text-xs"
                    value={server.name}
                    placeholder="filesystem"
                    onChange={(e) => updateAt(index, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">类型</Label>
                  <Select
                    value={server.transport}
                    onValueChange={(v) =>
                      updateAt(index, {
                        transport: v as McpServerDraft["transport"],
                        ...(v === "http"
                          ? { command: undefined, args: undefined, url: server.url || "https://" }
                          : {
                              url: undefined,
                              command: server.command || "npx",
                              args: server.args ?? ["-y", "package"],
                            }),
                      })
                    }
                  >
                    <SelectTrigger className="h-9 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stdio">stdio（本地命令）</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {server.transport === "http" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">URL</Label>
                    <Input
                      className="h-9 font-mono text-xs"
                      value={server.url ?? ""}
                      placeholder="https://mcp.example.com/mcp"
                      onChange={(e) => updateAt(index, { url: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Command</Label>
                      <Input
                        className="h-9 font-mono text-xs"
                        value={server.command ?? ""}
                        placeholder="npx"
                        onChange={(e) => updateAt(index, { command: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Args（空格分隔）</Label>
                      <Input
                        className="h-9 font-mono text-xs"
                        value={(server.args ?? []).join(" ")}
                        placeholder="-y @modelcontextprotocol/server-filesystem ."
                        onChange={(e) =>
                          updateAt(index, {
                            args: e.target.value.trim()
                              ? e.target.value.trim().split(/\s+/)
                              : [],
                          })
                        }
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">环境变量（每行 KEY=VALUE）</Label>
                  <Textarea
                    className="min-h-20 font-mono text-xs"
                    value={envToText(server.env)}
                    placeholder={"API_TOKEN=xxx"}
                    onChange={(e) => updateAt(index, { env: textToEnv(e.target.value) })}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        className="h-11 w-full rounded-2xl"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "保存中…" : "保存 MCP 配置"}
      </Button>
    </div>
  )
}
