import { useMutation, useQuery } from "@tanstack/react-query"
import { listen } from "@tauri-apps/api/event"
import { Activity, Cpu, Gauge, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import { runContentAgent } from "~/agents/content-agent"
import { SectionHeading } from "~/components/section-heading"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { getRuntimeMetrics, getRuntimeSettings } from "~/services/workspace"

type AgentStreamEvent = { type: "token"; text: string }

export default function CreatorRoute() {
  const [topic, setTopic] = useState("")
  const [goal, setGoal] = useState("")
  const [references, setReferences] = useState("")
  const [modelPath, setModelPath] = useState("")
  const [useManualModel, setUseManualModel] = useState(false)
  const [streamText, setStreamText] = useState("")

  const { data: settings } = useQuery({
    queryKey: ["runtime-settings"],
    queryFn: getRuntimeSettings,
  })
  const { data: metrics } = useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: getRuntimeMetrics,
    refetchInterval: 3000,
  })
  const agentMutation = useMutation({
    mutationFn: runContentAgent,
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<AgentStreamEvent | { type: string; text?: string }>(
      "content-agent-event",
      (event) => {
        const payload = event.payload
        if (payload.type === "token" && payload.text) {
          setStreamText((text) => `${text}${payload.text}`)
        }
      }
    ).then((handler) => {
      unlisten = handler
    })

    return () => {
      unlisten?.()
    }
  }, [])

  const startAgent = () => {
    setStreamText("")
    agentMutation.reset()
    agentMutation.mutate({
      topic,
      goal,
      references,
      modelPath: useManualModel ? modelPath : undefined,
      modelId: metrics?.recommendedModelId,
    })
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="创作中心"
        title="生成草稿"
        description="输入主题和要求，生成可编辑草稿。"
      />

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={Cpu}
          label="CPU"
          value={`${metrics?.cpuUsagePercent.toFixed(0) ?? "--"}%`}
          hint={`${metrics?.cpuCount ?? "--"} 线程`}
        />
        <MetricCard
          icon={Activity}
          label="内存"
          value={`${metrics?.availableMemoryGb.toFixed(1) ?? "--"} GB 可用`}
          hint={`${metrics?.totalMemoryGb.toFixed(1) ?? "--"} GB 总量`}
        />
        <MetricCard
          icon={Gauge}
          label="建议模型"
          value={metrics?.recommendedModelId ?? "--"}
          hint={metrics?.pressure ?? "--"}
        />
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>创作输入</CardTitle>
          <CardDescription>支持引用素材和手动指定模型。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="选题">
            <Input
              placeholder="输入选题"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </Field>
          <Field label="目标">
            <Textarea
              placeholder="写清楚目标人群、平台、语气和限制条件"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </Field>
          <Field label="素材">
            <Textarea
              placeholder="粘贴真实素材或补充背景"
              value={references}
              onChange={(event) => setReferences(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useManualModel}
              onChange={(event) => setUseManualModel(event.target.checked)}
            />
            手动指定模型
          </label>
          {useManualModel ? (
            <Field label="模型路径">
              <Input
                placeholder="D:\\models\\qwen2.5-3b-instruct-q4_k_m.gguf"
                value={modelPath}
                onChange={(event) => setModelPath(event.target.value)}
              />
            </Field>
          ) : (
            <p className="rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground">
              已启用模型：
              {settings?.models.filter((model) => model.enabled).length ?? 0}
            </p>
          )}
          {agentMutation.error instanceof Error ? (
            <p className="text-sm text-destructive">
              {agentMutation.error.message}
            </p>
          ) : null}
          <Button
            className="gap-2"
            disabled={
              agentMutation.isPending ||
              !topic.trim() ||
              !goal.trim() ||
              (useManualModel && !modelPath.trim())
            }
            onClick={startAgent}
          >
            <Sparkles className="size-4" />
            {agentMutation.isPending ? "生成中..." : "生成草稿"}
          </Button>

          {(agentMutation.isPending || streamText) && (
            <div className="rounded-lg border border-border/70 p-4">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-sm">
                {streamText}
              </pre>
            </div>
          )}

          {agentMutation.data ? (
            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <p className="text-sm font-semibold">
                {agentMutation.data.title}
              </p>
              <p className="whitespace-pre-wrap text-sm">
                {agentMutation.data.body}
              </p>
              {agentMutation.data.tags.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  标签：{agentMutation.data.tags.join(" / ")}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                模型：{agentMutation.data.trace.modelLabel ?? "unknown"} ·{" "}
                {agentMutation.data.trace.elapsedMs ?? 0}ms
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-border/70 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
