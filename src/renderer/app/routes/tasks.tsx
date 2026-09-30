import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, Loader2, Play, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Badge } from "~/components/ui/badge"
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
import { cn } from "~/lib/utils"
import {
  listScheduledTasks,
  removeScheduledTask,
  runTaskNow,
  subscribeTasksChanged,
  upsertScheduledTask,
} from "~/services/scheduled-tasks"
import { setActiveSessionId } from "~/services/pi-chat-sessions"
import {
  describeSchedule,
  describeStatus,
  isValidTaskName,
  newTaskId,
  normalizeTaskName,
  type ScheduledTask,
  type ScheduleType,
  validateSchedule,
} from "../../../shared/scheduled-tasks"

const TASKS_QUERY_KEY = ["scheduled-tasks"] as const

const WEEKDAYS = [
  { value: "0", label: "周日" },
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
]

function emptyTask(): ScheduledTask {
  return {
    id: newTaskId(),
    name: "",
    prompt: "",
    schedule: { type: "daily", time: "09:00" },
    enabled: true,
    createdAt: Date.now(),
  }
}

function TaskEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: ScheduledTask
  onChange: (next: ScheduledTask) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const schedule = draft.schedule

  const setScheduleType = (type: ScheduleType) => {
    if (type === "interval") {
      onChange({ ...draft, schedule: { type, minutes: 60 } })
      return
    }
    if (type === "weekly") {
      onChange({
        ...draft,
        schedule: { type, time: schedule.time ?? "09:00", weekday: 1 },
      })
      return
    }
    onChange({ ...draft, schedule: { type, time: schedule.time ?? "09:00" } })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="space-y-2">
        <Label htmlFor="task-name">名称</Label>
        <Input
          id="task-name"
          value={draft.name}
          maxLength={40}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="例如：每日摘要"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-prompt">提示词</Label>
        <Textarea
          id="task-prompt"
          value={draft.prompt}
          rows={4}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
          placeholder="Agent 每次执行时发送的内容"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-system">系统提示（可选）</Label>
        <Textarea
          id="task-system"
          value={draft.systemPrompt ?? ""}
          rows={2}
          onChange={(e) =>
            onChange({
              ...draft,
              systemPrompt: e.target.value.trim() || undefined,
            })
          }
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>调度</Label>
          <Select
            value={schedule.type}
            onValueChange={(v) => setScheduleType(v as ScheduleType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interval">间隔</SelectItem>
              <SelectItem value="daily">每天</SelectItem>
              <SelectItem value="weekly">每周</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {schedule.type === "interval" ? (
          <div className="space-y-2">
            <Label htmlFor="task-minutes">间隔（分钟）</Label>
            <Input
              id="task-minutes"
              type="number"
              min={1}
              max={10080}
              value={schedule.minutes ?? 60}
              onChange={(e) =>
                onChange({
                  ...draft,
                  schedule: {
                    type: "interval",
                    minutes: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="task-time">时间</Label>
            <Input
              id="task-time"
              value={schedule.time ?? "09:00"}
              onChange={(e) =>
                onChange({
                  ...draft,
                  schedule: { ...schedule, time: e.target.value },
                })
              }
              placeholder="09:30"
            />
          </div>
        )}
      </div>
      {schedule.type === "weekly" ? (
        <div className="space-y-2">
          <Label>星期</Label>
          <Select
            value={String(schedule.weekday ?? 1)}
            onValueChange={(v) =>
              onChange({
                ...draft,
                schedule: { ...schedule, weekday: Number(v) },
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
          />
          <span className="text-sm text-muted-foreground">启用</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function TasksRoute() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ScheduledTask | null>(null)

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: listScheduledTasks,
  })

  useEffect(() => {
    return subscribeTasksChanged(() => {
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    })
  }, [queryClient])

  const saveMutation = useMutation({
    mutationFn: upsertScheduledTask,
    onSuccess: () => {
      toast.success("已保存")
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    },
    onError: (err: Error) => toast.error(err.message || "保存失败"),
  })

  const removeMutation = useMutation({
    mutationFn: removeScheduledTask,
    onSuccess: () => {
      toast.success("已删除")
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    },
    onError: (err: Error) => toast.error(err.message || "删除失败"),
  })

  const runMutation = useMutation({
    mutationFn: runTaskNow,
    onSuccess: () => toast.success("已开始执行"),
    onError: (err: Error) => toast.error(err.message || "执行失败"),
  })

  const saveDraft = () => {
    if (!draft) return
    const name = normalizeTaskName(draft.name)
    if (!isValidTaskName(name)) {
      toast.error("名称长度需在 1~40 字")
      return
    }
    if (!draft.prompt.trim()) {
      toast.error("请填写提示词")
      return
    }
    const scheduleErr = validateSchedule(draft.schedule)
    if (scheduleErr) {
      toast.error(scheduleErr)
      return
    }
    saveMutation.mutate({ ...draft, name, prompt: draft.prompt.trim() })
  }

  const openLastSession = async (sessionId: string) => {
    await setActiveSessionId(sessionId)
    navigate("/chat")
  }

  return (
    <div className="w-full space-y-6 pt-4 pb-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">定时任务</h1>
            <p className="text-sm text-muted-foreground">
              按间隔或固定时间自动运行 Agent
            </p>
          </div>
        </div>
        {!draft ? (
          <Button onClick={() => setDraft(emptyTask())}>
            <Plus className="size-4" />
            新建
          </Button>
        ) : null}
      </header>

      {draft ? (
        <TaskEditor
          draft={draft}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          saving={saveMutation.isPending}
        />
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          加载中…
        </div>
      ) : tasks.length === 0 && !draft ? (
        <p className="rounded-2xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
          暂无定时任务，点击「新建」添加
        </p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{task.name}</span>
                  {!task.enabled ? (
                    <Badge variant="secondary">已停用</Badge>
                  ) : null}
                  {task.lastStatus === "running" ? <Badge>运行中</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {describeSchedule(task.schedule)} · {describeStatus(task)}
                </p>
                {task.lastError ? (
                  <p className="text-xs text-destructive">{task.lastError}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {task.lastSessionId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openLastSession(task.lastSessionId!)}
                  >
                    查看结果
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...task })}
                >
                  编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runMutation.isPending}
                  onClick={() => runMutation.mutate(task.id)}
                >
                  <Play className="size-3.5" />
                  立即运行
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("text-destructive hover:text-destructive")}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(task.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
