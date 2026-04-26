import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Link2, LoaderCircle, ScanSearch, UserCheck } from "lucide-react"
import { useState, type ComponentType } from "react"

import { SectionHeading } from "~/components/section-heading"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import {
  createImportJob,
  listImportJobs,
  retryJob,
  runNextStage,
  type ImportJob,
} from "~/services/import-jobs"

type PipelineStep = {
  title: string
  detail: string
  icon: ComponentType<{ className?: string }>
}

const steps: PipelineStep[] = [
  {
    title: "贴入文章链接",
    detail: "用户只需提供小红书文章链接。",
    icon: Link2,
  },
  {
    title: "用户自行登录",
    detail: "登录由用户手动完成，系统不代管账号密码。",
    icon: UserCheck,
  },
  {
    title: "真实采集后端",
    detail: "必须接入可执行的采集、OCR 或模型服务后才能运行。",
    icon: Bot,
  },
]

const stageLabelMap = {
  queued: "待执行",
  screenshot: "截图中",
  extract: "提取中",
  understand: "理解中",
  done: "已完成",
  failed: "失败",
} as const

export default function ImportRoute() {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: jobs = [], error: queryError } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: listImportJobs,
  })

  const createMutation = useMutation({
    mutationFn: createImportJob,
    onSuccess: () => {
      setUrl("")
      setErrorMessage(null)
      queryClient.invalidateQueries({ queryKey: ["import-jobs"] })
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })

  const runMutation = useMutation({
    mutationFn: runNextStage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-jobs"] })
    },
    onError: (error) => {
      setErrorMessage(error.message)
      queryClient.invalidateQueries({ queryKey: ["import-jobs"] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: retryJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-jobs"] })
    },
  })

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="数据录入"
        title="以链接为入口，等待真实采集能力执行"
        description="这里不再使用模拟结果。没有接入真实采集、OCR 和模型后端时，任务会明确失败并保留原因。"
      />

      <Card>
        <CardHeader>
          <CardTitle>单条文章采集</CardTitle>
          <CardDescription>
            粘贴小红书文章链接后会创建真实任务记录，不会生成伪造结果。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="粘贴文章链接，例如：https://www.xiaohongshu.com/explore/..."
          />
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}
          {queryError instanceof Error ? (
            <p className="text-sm text-destructive">{queryError.message}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={createMutation.isPending || !url.trim()}
              onClick={() => createMutation.mutate(url.trim())}
            >
              {createMutation.isPending ? (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  创建中
                </>
              ) : (
                "创建采集任务"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon

          return (
            <Card key={step.title}>
              <CardHeader>
                <div className="mb-2 inline-flex size-9 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4" />
                </div>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.detail}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>任务队列</CardTitle>
          <CardDescription>
            任务记录由 Tauri 后端持久化到本机应用数据目录。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              暂无任务，先录入一条链接开始。
            </p>
          ) : null}

          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onRun={() => runMutation.mutate(job.id)}
              running={
                runMutation.isPending && runMutation.variables === job.id
              }
              onRetry={() => retryMutation.mutate(job.id)}
              retrying={
                retryMutation.isPending && retryMutation.variables === job.id
              }
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function JobRow({
  job,
  onRun,
  running,
  onRetry,
  retrying,
}: {
  job: ImportJob
  onRun: () => void
  running: boolean
  onRetry: () => void
  retrying: boolean
}) {
  const stage = stageLabelMap[job.stage]
  const canRun = job.stage === "queued"

  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold break-all">{job.sourceUrl}</p>
        <Badge variant={job.stage === "done" ? "secondary" : "outline"}>
          {stage}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        note_id: {job.noteId}
      </p>

      {job.extracted ? (
        <p className="mt-2 text-sm text-muted-foreground">
          提取结果：{job.extracted.author} · 点赞 {job.extracted.likes} · 收藏{" "}
          {job.extracted.saves}
        </p>
      ) : null}

      {job.insight ? <p className="mt-2 text-sm">结论：{job.insight}</p> : null}

      {job.errorMessage ? (
        <p className="mt-2 text-sm text-destructive">{job.errorMessage}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canRun ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRun}
            disabled={running}
          >
            {running ? (
              <>
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                执行中
              </>
            ) : (
              <>
                <ScanSearch className="mr-2 size-4" />
                执行真实采集
              </>
            )}
          </Button>
        ) : null}

        {job.stage === "failed" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "重试中" : "重置任务"}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
