import { useMutation } from "@tanstack/react-query"
import { ChevronDown, Loader2, Save, Send } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import {
  DesignerDraftPreview,
  parseDesignerDraft,
  type DesignerDraft,
} from "~/components/playbook/designer-draft-preview"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"
import {
  compilePrompt,
  designPlaybookFromIntent,
  saveUserScene,
  type DesignPlaybookTurn,
} from "~/services/playbook"

type PreviewTab = "structure" | "compile"

type ThreadMessage = DesignPlaybookTurn & { id: string }

const ASSISTANT_OK =
  "已根据你的描述更新右侧配置草案。可继续补充字段或语气，满意后点击底部保存。"

export default function PlaybookDesignerRoute() {
  const navigate = useNavigate()
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const [input, setInput] = useState("")
  const [draftJson, setDraftJson] = useState("")
  const [showJson, setShowJson] = useState(false)
  const [previewTab, setPreviewTab] = useState<PreviewTab>("structure")
  const threadEndRef = useRef<HTMLDivElement>(null)

  const structuredDraft = useMemo(
    () => (draftJson ? parseDesignerDraft(draftJson) : null),
    [draftJson]
  )

  const compilePreview = useMemo(() => {
    if (!structuredDraft) return ""
    const demoSlots = Object.fromEntries(
      structuredDraft.inputProfile.fields.map((f) => [f.key, `（${f.label} 示例）`])
    )
    return compilePrompt(structuredDraft.inputProfile, {
      slots: demoSlots,
    })
  }, [structuredDraft])

  const designMutation = useMutation({
    mutationFn: (turns: DesignPlaybookTurn[]) => designPlaybookFromIntent(turns),
    onSuccess: (res) => {
      if (res.parsed) {
        setDraftJson(JSON.stringify(res.parsed, null, 2))
        setShowJson(false)
        setThread((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: ASSISTANT_OK },
        ])
        toast.success("已生成配置草案")
      } else {
        setDraftJson(res.rawText)
        setShowJson(true)
        setThread((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "未能解析为 JSON，请展开右侧「查看 JSON」手动修正，或继续说明你的需求。",
          },
        ])
        toast.message("未能解析为 JSON，可展开高级编辑")
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "生成失败")
    },
  })

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [thread, designMutation.isPending])

  const saveMutation = useMutation({
    mutationFn: async (draft: DesignerDraft) => {
      await saveUserScene({
        playbook: draft.playbook,
        inputProfile: draft.inputProfile,
      })
      return draft.playbook.id
    },
    onSuccess: (id) => {
      toast.success("场景已保存")
      navigate(`/chat?playbook=${encodeURIComponent(id)}`)
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "保存失败")
    },
  })

  const sendTurn = () => {
    const text = input.trim()
    if (!text || designMutation.isPending) return
    const userMsg: ThreadMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    }
    const turns: DesignPlaybookTurn[] = [
      ...thread.map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ]
    setThread((prev) => [...prev, userMsg])
    setInput("")
    designMutation.mutate(turns)
  }

  const saveFromJson = () => {
    const draft = parseDesignerDraft(draftJson)
    if (!draft) {
      toast.error("JSON 格式无效，请检查 playbook 与 inputProfile")
      return
    }
    saveMutation.mutate(draft)
  }

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 gap-2 rounded-xl">
          <Link to="/scenes">← 场景</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">对话创建场景</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          左侧多轮描述需求，右侧实时预览结构化配置，确认后保存为创作任务。
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[2fr_3fr]">
        <section className="flex min-h-[min(50vh,520px)] flex-col rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-medium">设计对话</p>
            <p className="text-xs text-muted-foreground">可多次补充、修改场景要求</p>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {thread.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                例如：每天根据商品链接写 3 条小红书口语笔记，要参考爆款，语气治愈。
              </p>
            ) : (
              thread.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "max-w-[95%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "border border-border/60 bg-muted/40 text-foreground"
                  )}
                >
                  {msg.content}
                </div>
              ))
            )}
            {designMutation.isPending ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                正在生成草案…
              </div>
            ) : null}
            <div ref={threadEndRef} />
          </div>

          <div className="shrink-0 space-y-2 border-t border-border/60 p-4">
            <Textarea
              value={input}
              className="min-h-[88px] resize-none rounded-xl"
              placeholder="描述或修改场景需求…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  sendTurn()
                }
              }}
            />
            <Button
              className="h-11 w-full rounded-2xl"
              disabled={!input.trim() || designMutation.isPending}
              onClick={sendTurn}
            >
              {designMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              发送并更新草案
            </Button>
          </div>
        </section>

        <section className="flex min-h-[min(50vh,480px)] flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
              {(
                [
                  ["structure", "结构化"],
                  ["compile", "编译预览"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    previewTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-background/80"
                  )}
                  onClick={() => setPreviewTab(tab)}
                  disabled={!structuredDraft}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {previewTab === "compile" && structuredDraft ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {compilePreview}
              </pre>
            ) : structuredDraft ? (
              <DesignerDraftPreview draft={structuredDraft} />
            ) : draftJson ? (
              <p className="text-sm text-muted-foreground">
                预览解析失败，请使用下方「查看 JSON」修正后保存。
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                在左侧发送描述后，将在此显示字段预览。
              </p>
            )}
          </div>

          {draftJson ? (
            <details
              className="mt-4 border-t border-border/60 pt-4"
              open={showJson}
              onToggle={(e) => setShowJson(e.currentTarget.open)}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className={cn("size-4 transition-transform", showJson && "rotate-180")}
                />
                查看 JSON（高级）
              </summary>
              <Textarea
                value={draftJson}
                className="mt-3 min-h-48 max-h-96 rounded-xl font-mono text-xs overflow-auto"
                onChange={(e) => setDraftJson(e.target.value)}
              />
            </details>
          ) : null}
        </section>
      </div>

      <div className="sticky bottom-0 border-t border-border/60 bg-background py-4">
        <Button
          className="h-12 w-full max-w-md rounded-2xl text-base"
          disabled={!draftJson || saveMutation.isPending}
          onClick={() => {
            if (structuredDraft) {
              saveMutation.mutate(structuredDraft)
            } else {
              saveFromJson()
            }
          }}
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          保存为我的任务
        </Button>
      </div>
    </div>
  )
}
