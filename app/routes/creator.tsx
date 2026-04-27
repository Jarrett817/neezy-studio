import { useMutation, useQuery } from "@tanstack/react-query"
import { listen } from "@tauri-apps/api/event"
import { Activity, Cpu, Gauge, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

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
import {
  getRuntimeMetrics,
  getRuntimeSettings,
  runContentAgent,
} from "~/services/workspace"

type AgentStreamEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "token"; stage: string; text: string }

export default function CreatorRoute() {
  const [topic, setTopic] = useState("")
  const [goal, setGoal] = useState("")
  const [references, setReferences] = useState("")
  const [modelPath, setModelPath] = useState("")
  const [useManualModel, setUseManualModel] = useState(false)
  const [streamEvents, setStreamEvents] = useState<AgentStreamEvent[]>([])
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
    listen<AgentStreamEvent>("content-agent-event", (event) => {
      const payload = event.payload
      setStreamEvents((items) => [...items.slice(-12), payload])
      if (payload.type === "token") {
        setStreamText((text) => `${text}${payload.text}`)
      }
    }).then((handler) => {
      unlisten = handler
    })

    return () => {
      unlisten?.()
    }
  }, [])

  const startAgent = () => {
    setStreamEvents([])
    setStreamText("")
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
        title="博主生产 Agent"
        description="Bun 侧车会自动串联记忆、知识库、技能和本地模型，并按当前性能选择合适模型。"
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
          label="调度"
          value={metrics?.pressure ?? "--"}
          hint={metrics?.recommendedReason ?? "等待性能采样"}
        />
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>创作输入</CardTitle>
          <CardDescription>
            输入选题后，Agent 会读取账号记忆（人设/语气/禁忌词）+ 本地知识库素材
            + 技能链，生成可编辑草稿。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="本次选题">
            <Input
              placeholder="输入选题"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </Field>
          <Field label="创作目标">
            <Textarea
              placeholder="写清楚目标人群、平台、语气和限制条件"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </Field>
          <Field label="引用素材">
            <Textarea
              placeholder="粘贴真实素材或从知识库插入"
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
            手动指定本次 GGUF 模型，不使用自动调度
          </label>
          {useManualModel ? (
            <Field label="本地模型路径（GGUF）">
              <Input
                placeholder="D:\\models\\qwen2.5-3b-instruct-q4_k_m.gguf"
                value={modelPath}
                onChange={(event) => setModelPath(event.target.value)}
              />
            </Field>
          ) : (
            <p className="rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground">
              自动调度会从设置页登记的{" "}
              {settings?.models.filter((model) => model.enabled).length ?? 0}{" "}
              个模型中选择，当前建议：
              {metrics?.recommendedModelId ?? "暂无可用模型"}。
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
            {agentMutation.isPending ? "Agent 运行中..." : "生成草稿"}
          </Button>

          {agentMutation.isPending || streamEvents.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <p className="text-sm font-semibold">Agent 实时输出</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {streamEvents
                  .filter((event) => event.type === "stage")
                  .map((event, index) => (
                    <p key={`${event.stage}-${index}`}>
                      {event.stage}: {event.message}
                    </p>
                  ))}
              </div>
              {streamText ? (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {streamText}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  正在启动本地模型，首次加载 GGUF 可能需要几十秒。
                </p>
              )}
            </div>
          ) : null}

          {agentMutation.data ? (
            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <p className="text-sm font-semibold">
                {agentMutation.data.title}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {agentMutation.data.body}
              </p>
              <p className="text-xs text-muted-foreground">
                标签：{agentMutation.data.tags.join(" / ")}
              </p>
              <p className="text-xs text-muted-foreground">
                模型：{agentMutation.data.trace.modelLabel ?? "unknown"} ·
                knowledge: {agentMutation.data.trace.knowledgeUsed ?? 0}/
                {agentMutation.data.trace.totalKnowledge ?? 0} · elapsed:{" "}
                {agentMutation.data.trace.elapsedMs ?? 0}ms
              </p>
              {agentMutation.data.trace.runtime ? (
                <p className="text-xs text-muted-foreground">
                  runtime: {agentMutation.data.trace.runtime.maxThreads} threads
                  · ctx {agentMutation.data.trace.runtime.contextSize} ·{" "}
                  {agentMutation.data.trace.runtime.pressure}
                </p>
              ) : null}
              {agentMutation.data.trace.modelSuite ? (
                <p className="text-xs text-muted-foreground">
                  suite: {agentMutation.data.trace.modelSuite.mode} · planner{" "}
                  {agentMutation.data.trace.modelSuite.planner} · writer{" "}
                  {agentMutation.data.trace.modelSuite.writer} · reviewer{" "}
                  {agentMutation.data.trace.modelSuite.reviewer}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                stages: {(agentMutation.data.trace.stages ?? []).join(" -> ")}
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
