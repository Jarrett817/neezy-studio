import { Badge } from "~/components/ui/badge"
import {
  inputProfileSchema,
  playbookSchema,
  type InputProfile,
  type Playbook,
} from "~/services/playbook"
import { resolveTokenDefs } from "~/services/playbook/compile-prompt"

export type DesignerDraft = {
  playbook: Playbook
  inputProfile: InputProfile
}

export function parseDesignerDraft(json: string): DesignerDraft | null {
  try {
    const raw = JSON.parse(json) as {
      playbook?: unknown
      inputProfile?: unknown
    }
    const inputProfile = inputProfileSchema.safeParse(raw.inputProfile)
    if (!inputProfile.success) return null
    const playbook = playbookSchema.safeParse({
      ...(raw.playbook as object),
      inputProfileId: inputProfile.data.id,
    })
    if (!playbook.success) return null
    return { playbook: playbook.data, inputProfile: inputProfile.data }
  } catch {
    return null
  }
}

export function DesignerDraftPreview({ draft }: { draft: DesignerDraft }) {
  const { playbook, inputProfile } = draft

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">场景</h3>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="font-medium">{playbook.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {playbook.description}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            id: {playbook.id}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">输入字段</h3>
        <ul className="space-y-2">
          {inputProfile.fields.map((field) => {
            const isRich = field.type === "rich-text"
            const tokens = isRich ? resolveTokenDefs(field) : []
            return (
              <li
                key={field.key}
                className="space-y-1.5 rounded-xl border border-border/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isRich ? (
                      <Badge variant="default" className="font-mono text-xs">
                        rich-text
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" className="font-mono text-xs">
                      {field.key}
                    </Badge>
                  </div>
                </div>
                {isRich && field.template ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-background/60 p-2 font-mono text-xs leading-relaxed">
                    {field.template}
                  </div>
                ) : null}
                {tokens.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {tokens.map((t) => (
                      <Badge
                        key={t.key}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {t.key}:{t.type}
                        {t.chips?.length || t.options?.length
                          ? `[${(t.chips ?? t.options ?? []).length}]`
                          : ""}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Prompt 模板预览</h3>
        <pre className="max-h-40 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {inputProfile.promptTemplate.slice(0, 480)}
          {inputProfile.promptTemplate.length > 480 ? "…" : ""}
        </pre>
      </section>
    </div>
  )
}
