import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { useParams } from "react-router"

import { PlaybookInputForm } from "~/components/playbook/playbook-input-form"
import { PlaybookRunResultPanel } from "~/components/playbook/playbook-run-result"
import {
  TaskRunLayout,
  type TaskRunStep,
} from "~/components/shell/task-run-layout"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { getInputProfile, getPlaybook, runPlaybook } from "~/services/playbook"
import { listSkills } from "~/services/storage/skills"

const FORM_ID = "playbook-run-form"

export default function PlaybookRunRoute() {
  const { playbookId = "" } = useParams()
  const [skillId, setSkillId] = useState<string>("")

  const { data: playbook, isLoading: loadingPlaybook } = useQuery({
    queryKey: ["playbook", playbookId],
    queryFn: () => getPlaybook(playbookId),
    enabled: Boolean(playbookId),
  })

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["input-profile", playbook?.inputProfileId],
    queryFn: () => getInputProfile(playbook!.inputProfileId),
    enabled: Boolean(playbook?.inputProfileId),
  })

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })

  const allowedSkills = skills.filter((s) => playbook?.skillIds.includes(s.id))

  const activeSkillId =
    skillId || playbook?.defaultSkillId || playbook?.skillIds[0] || ""

  const runMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      runPlaybook(playbookId, values, {
        skillId: activeSkillId || undefined,
      }),
  })

  const loading = loadingPlaybook || loadingProfile

  if (loading) {
    return (
      <p className="mx-auto max-w-4xl pt-4 text-sm text-muted-foreground">加载中…</p>
    )
  }

  if (!playbook || !profile) {
    return (
      <p className="mx-auto max-w-4xl pt-4 text-sm text-destructive">
        场景不存在或配置不完整
      </p>
    )
  }

  const step: TaskRunStep = runMutation.isPending
    ? "generating"
    : runMutation.data
      ? "result"
      : "fill"

  return (
    <TaskRunLayout
      title={playbook.name}
      description={playbook.description}
      step={step}
      playbookId={playbookId}
      capture={
        <div className="space-y-4">
          {allowedSkills.length > 1 ? (
            <div className="space-y-2">
              <Label>Skill</Label>
              <Select
                value={activeSkillId}
                onValueChange={setSkillId}
                disabled={runMutation.isPending}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="选择 Skill" />
                </SelectTrigger>
                <SelectContent>
                  {allowedSkills.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <PlaybookInputForm
            playbookId={playbookId}
            profile={profile}
            formId={FORM_ID}
            hideSubmitButton
            disabled={runMutation.isPending}
            onSubmit={(values) => runMutation.mutate(values)}
          />

          <Button
            type="submit"
            form={FORM_ID}
            className="h-12 w-full rounded-2xl text-base"
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                生成中…
              </>
            ) : (
              "开始生成"
            )}
          </Button>
        </div>
      }
      result={
        runMutation.data ? (
          <PlaybookRunResultPanel result={runMutation.data} showFooter={false} />
        ) : runMutation.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在生成内容，请稍候…
          </div>
        ) : undefined
      }
      trace={
        runMutation.data?.trace ??
        (runMutation.isPending
          ? {
              playbookId,
              skillId: activeSkillId,
              memoriesUsed: 0,
              elapsedMs: 0,
              stages: ["generate"],
            }
          : undefined)
      }
    />
  )
}
