import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Bot,
  FolderInput,
  Link2,
  LoaderCircle,
  ScanSearch,
  UserCheck,
} from "lucide-react"
import { useState } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  createImportJob,
  listImportJobs,
  retryJob,
  runNextStage,
  type ImportJob,
} from "~/services/import-jobs"

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
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          数据录入
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          从外部链接导入内容到知识库
        </p>
      </div>

      {/* 录入表单 */}
      <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FolderInput className="size-5 text-primary" />
          <p className="text-sm font-semibold">粘贴文章链接</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.xiaohongshu.com/explore/..."
            className="bg-transparent"
          />
          <Button
            className="shrink-0 gap-2 rounded-xl"
            disabled={createMutation.isPending || !url.trim()}
            onClick={() => createMutation.mutate(url.trim())}
          >
            {createMutation.isPending ? (
              <LoaderCircle className="spin-warm size-4" />
            ) : (
              <ScanSearch className="size-4" />
            )}
            创建
          </Button>
        </div>
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {queryError instanceof Error && (
          <p className="text-sm text-red-500">{queryError.message}</p>
        )}
      </div>

      {/* 流程说明 */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            icon: Link2,
            label: "贴入链接",
            color: "text-amber-500",
            bg: "bg-amber-50 dark:bg-amber-950/40",
          },
          {
            icon: UserCheck,
            label: "用户登录",
            color: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-950/40",
          },
          {
            icon: Bot,
            label: "真实采集",
            color: "text-sky-500",
            bg: "bg-sky-50 dark:bg-sky-950/40",
          },
        ].map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className={`rounded-xl ${bg} w-fit p-2.5`}>
              <Icon className={`size-4 ${color}`} />
            </div>
            <p className="mt-3 text-sm font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* 任务列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">任务队列</p>
          <Badge variant="outline" className="rounded-full text-xs">
            {jobs.length} 个
          </Badge>
        </div>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderInput className="mb-2 size-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">暂无任务</p>
          </div>
        ) : (
          jobs.map((job) => (
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
          ))
        )}
      </div>
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

  return (
    <div className="group rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium break-all">{job.sourceUrl}</p>
        <Badge
          variant={job.stage === "done" ? "secondary" : "outline"}
          className="rounded-full text-xs"
        >
          {stage}
        </Badge>
      </div>
      {job.extracted && (
        <p className="mt-2 text-xs text-muted-foreground">
          {job.extracted.author} · 点赞 {job.extracted.likes} · 收藏{" "}
          {job.extracted.saves}
        </p>
      )}
      {job.errorMessage && (
        <p className="mt-2 text-xs text-red-500">{job.errorMessage}</p>
      )}
      <div className="mt-3 flex gap-2">
        {job.stage === "queued" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 rounded-xl text-xs"
            onClick={onRun}
            disabled={running}
          >
            {running ? (
              <LoaderCircle className="spin-warm size-3" />
            ) : (
              <ScanSearch className="size-3" />
            )}
            执行
          </Button>
        )}
        {job.stage === "failed" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 rounded-xl text-xs"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "重试中..." : "重试"}
          </Button>
        )}
      </div>
    </div>
  )
}
