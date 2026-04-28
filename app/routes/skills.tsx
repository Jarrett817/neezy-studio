import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Save, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  deleteSkill,
  listSkills,
  saveSkill,
  type AgentSkill,
} from "~/services/workspace"

export default function SkillsRoute() {
  const queryClient = useQueryClient()
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  })
  const saveMutation = useMutation({
    mutationFn: saveSkill,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  })
  const [draft, setDraft] = useState<AgentSkill>(emptySkill())

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-base font-semibold">Skill 管理</h1>
        <p className="text-sm text-muted-foreground">
          启用的 Skill 会进入 Agent 编排提示。
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Skill 名称"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <Input
            placeholder="说明"
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            启用
          </label>
        </div>
        <Textarea
          className="mt-3"
          placeholder="Skill Prompt"
          value={draft.prompt}
          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
        />
        <Button
          className="mt-3 gap-2"
          disabled={!draft.name.trim() || !draft.prompt.trim()}
          onClick={() => {
            saveMutation.mutate(draft)
            setDraft(emptySkill())
          }}
        >
          <Plus className="size-4" />
          添加 Skill
        </Button>
      </div>

      <div className="grid gap-3">
        {skills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            onSave={(next) => saveMutation.mutate(next)}
            onDelete={() => deleteMutation.mutate(skill.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  onSave,
  onDelete,
}: {
  skill: AgentSkill
  onSave: (skill: AgentSkill) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(skill)
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <Input
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft({ ...draft, enabled: event.target.checked })
            }
          />
          启用
        </label>
      </div>
      <Textarea
        className="mt-3"
        value={draft.prompt}
        onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
        <Button className="gap-2" onClick={() => onSave(draft)}>
          <Save className="size-4" />
          保存
        </Button>
      </div>
    </div>
  )
}

function emptySkill(): AgentSkill {
  return {
    id: `skill-${Date.now()}`,
    name: "",
    description: "",
    prompt: "",
    enabled: true,
  }
}
