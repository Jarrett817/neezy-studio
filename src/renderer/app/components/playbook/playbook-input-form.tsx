import { useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { PlaybookWizardForm } from "~/components/playbook/playbook-wizard-form"
import { RichTextField } from "~/components/playbook/RichTextField"
import { FlowchartField, FlowchartFieldLabel } from "~/components/playbook/flowchart-field"
import { MindmapField, MindmapFieldLabel } from "~/components/playbook/mindmap-field"
import { CanvasField, CanvasFieldLabel } from "~/components/playbook/canvas-field"
import {
  defaultFlowchartValue,
  defaultMindmapValue,
} from "~/services/playbook/graph-serializers"
import {
  extractSlotsFromSingleLine,
  loadInputSceneSlots,
  saveInputSceneSlots,
  SlotValidationError,
  type InputField,
  type InputProfile,
} from "~/services/playbook"

type PlaybookInputFormProps = {
  /** 用于持久化填表草稿（InputProfile id） */
  profileId: string
  profile: InputProfile
  disabled?: boolean
  formId?: string
  hideSubmitButton?: boolean
  submitLabel?: string
  onSubmit: (values: Record<string, unknown>) => void
  onValuesChange?: (values: Record<string, unknown>) => void
}

function buildDefaultValues(profile: InputProfile): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  for (const field of profile.fields) {
    if (field.type === "mindmap") {
      v[field.key] = defaultMindmapValue()
    } else if (field.type === "flowchart") {
      v[field.key] = defaultFlowchartValue()
    } else if (field.default !== undefined) {
      v[field.key] = field.default
    }
  }
  return v
}

function mergeDraftValues(
  profile: InputProfile,
  draft: Record<string, unknown> | null
): Record<string, unknown> {
  const v = buildDefaultValues(profile)
  if (!draft) return v
  for (const field of profile.fields) {
    const prev = draft[field.key]
    if (prev !== undefined) v[field.key] = prev
  }
  return v
}

export function PlaybookInputForm({
  profileId,
  profile,
  disabled,
  formId = "playbook-run-form",
  hideSubmitButton = false,
  submitLabel = "开始生成",
  onSubmit,
  onValuesChange,
}: PlaybookInputFormProps) {
  const capture = profile.capture ?? ["form"]
  const showSingleLine = capture.includes("singleLineExtract")

  const [values, setValues] = useState(() => buildDefaultValues(profile))
  const [draftReady, setDraftReady] = useState(false)
  const [singleLine, setSingleLine] = useState("")
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDraftReady(false)
    void (async () => {
      const last = await loadInputSceneSlots(profileId)
      if (cancelled) return
      setValues(mergeDraftValues(profile, last))
      setDraftReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [profile, profileId])

  useEffect(() => {
    if (!draftReady) return
    onValuesChange?.(values)
    void saveInputSceneSlots(profileId, values)
  }, [values, onValuesChange, profileId, draftReady])

  const useWizard =
    profile.fields.length > 2 &&
    !profile.fields.some((f) =>
      ["rich-text", "mindmap", "flowchart", "canvas"].includes(f.type ?? "")
    )

  if (useWizard) {
    return (
      <PlaybookWizardForm
        profileId={profileId}
        profile={profile}
        disabled={disabled}
        formId={formId}
        onSubmit={onSubmit}
        onValuesChange={onValuesChange}
      />
    )
  }

  const handleExtract = async () => {
    if (!singleLine.trim()) {
      toast.error("请先输入一句话描述需求")
      return
    }
    setExtracting(true)
    try {
      const slots = await extractSlotsFromSingleLine(profile, singleLine)
      const next: Record<string, unknown> = { ...values }
      for (const field of profile.fields) {
        const v = slots[field.key]
        if (v === undefined || v === null || String(v).trim() === "") continue
        if (field.type === "number") next[field.key] = Number(v)
        else next[field.key] = String(v)
      }
      setValues(next)
      toast.success("已填入识别到的字段")
    } catch (e) {
      const msg =
        e instanceof SlotValidationError
          ? e.message
          : e instanceof Error
            ? e.message
            : "提取失败"
      toast.error(msg)
    } finally {
      setExtracting(false)
    }
  }

  return (
    <form
      id={formId}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        saveInputSceneSlots(profileId, values)
        onSubmit(values)
      }}
    >
      {showSingleLine ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
          <Label className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            一句话描述（自动填表）
          </Label>
          <div className="flex gap-2">
            <Input
              value={singleLine}
              disabled={disabled || extracting}
              className="rounded-xl"
              placeholder="例如：更细笔触大写3句口播笔记，语气犀利"
              onChange={(e) => setSingleLine(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-xl"
              disabled={disabled || extracting || !singleLine.trim()}
              onClick={() => void handleExtract()}
            >
              {extracting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "识别"
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {profile.fields.map((field) => (
        <FieldBlock
          key={field.key}
          field={field}
          value={values[field.key]}
          disabled={disabled}
          onChange={(next) =>
            setValues((prev) => ({ ...prev, [field.key]: next }))
          }
        />
      ))}
      {hideSubmitButton ? null : (
        <Button
          type="submit"
          className="h-12 w-full rounded-2xl text-base"
          disabled={disabled}
        >
          {submitLabel}
        </Button>
      )}
    </form>
  )
}

function FieldBlock({
  field,
  value,
  disabled,
  onChange,
}: {
  field: InputField
  value: unknown
  disabled?: boolean
  onChange: (v: unknown) => void
}) {
  const chipOptions =
    field.chips?.map(String) ?? field.options ?? []

  if (field.type === "mindmap") {
    return (
      <div className="space-y-2">
        <MindmapFieldLabel label={field.label} required={field.required} />
        <MindmapField
          value={value}
          disabled={disabled}
          onChange={(next) => onChange(next)}
        />
      </div>
    )
  }

  if (field.type === "flowchart") {
    return (
      <div className="space-y-2">
        <FlowchartFieldLabel label={field.label} required={field.required} />
        <FlowchartField
          value={value}
          disabled={disabled}
          onChange={(next) => onChange(next)}
        />
      </div>
    )
  }

  if (field.type === "canvas") {
    return (
      <div className="space-y-2">
        <CanvasFieldLabel label={field.label} required={field.required} />
        <CanvasField
          value={value}
          disabled={disabled}
          onChange={(next) => onChange(next)}
        />
      </div>
    )
  }

  if (field.type === "rich-text") {
    return (
      <div className="space-y-2">
        <Label>
          {field.label}
          {field.required ? (
            <span className="text-destructive"> *</span>
          ) : null}
        </Label>
        <RichTextField
          field={field}
          value={value as string | number | Record<string, string | number> | undefined}
          disabled={disabled}
          onChange={(tokenValues) => onChange(tokenValues)}
        />
      </div>
    )
  }

  const scalar = value as string | number | undefined

  return (
    <div className="space-y-2">
      <Label>
        {field.label}
        {field.required ? (
          <span className="text-destructive"> *</span>
        ) : null}
      </Label>

      {field.chip && chipOptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chipOptions.map((opt) => (
            <Button
              key={opt}
              type="button"
              size="sm"
              variant={String(scalar) === opt ? "default" : "outline"}
              className="rounded-full"
              disabled={disabled}
              onClick={() =>
                onChange(field.type === "number" ? Number(opt) : opt)
              }
            >
              {opt}
            </Button>
          ))}
        </div>
      ) : null}

      {field.type === "textarea" ? (
        <Textarea
          value={scalar === undefined ? "" : String(scalar)}
          disabled={disabled}
          className="min-h-24 rounded-xl"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          value={scalar === undefined ? "" : String(scalar)}
          disabled={disabled}
          className="rounded-xl"
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <Input
          value={scalar === undefined ? "" : String(scalar)}
          disabled={disabled}
          className="rounded-xl"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
