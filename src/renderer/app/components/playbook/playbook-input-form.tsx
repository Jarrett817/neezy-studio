import { useMemo, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import {
  extractSlotsFromSingleLine,
  loadLastPlaybookSlots,
  saveLastPlaybookSlots,
  SlotValidationError,
  type InputField,
  type InputProfile,
} from "~/services/playbook"

type PlaybookInputFormProps = {
  playbookId: string
  profile: InputProfile
  disabled?: boolean
  formId?: string
  hideSubmitButton?: boolean
  submitLabel?: string
  onSubmit: (values: Record<string, unknown>) => void
}

export function PlaybookInputForm({
  playbookId,
  profile,
  disabled,
  formId = "playbook-run-form",
  hideSubmitButton = false,
  submitLabel = "开始生成",
  onSubmit,
}: PlaybookInputFormProps) {
  const capture = profile.capture ?? ["form"]
  const showSingleLine = capture.includes("singleLineExtract")

  const initial = useMemo(() => {
    const v: Record<string, string | number> = {}
    for (const field of profile.fields) {
      if (field.default !== undefined) v[field.key] = field.default
    }
    const last = loadLastPlaybookSlots(playbookId)
    if (last) {
      for (const field of profile.fields) {
        const prev = last[field.key]
        if (prev !== undefined) v[field.key] = prev
      }
    }
    return v
  }, [profile, playbookId])

  const [values, setValues] = useState(initial)
  const [singleLine, setSingleLine] = useState("")
  const [extracting, setExtracting] = useState(false)

  const handleExtract = async () => {
    if (!singleLine.trim()) {
      toast.error("请先输入一句话描述需求")
      return
    }
    setExtracting(true)
    try {
      const slots = await extractSlotsFromSingleLine(profile, singleLine)
      const next: Record<string, string | number> = { ...values }
      for (const field of profile.fields) {
        const v = slots[field.key]
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          next[field.key] =
            field.type === "number" ? Number(v) : String(v)
        }
      }
      setValues(next)
      toast.success("已填入识别到的字段")
    } catch (e) {
      const msg =
        e instanceof SlotValidationError
          ? e.message
          : e instanceof Error
            ? e.message
            : "抽槽失败"
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
        saveLastPlaybookSlots(playbookId, values)
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
              placeholder="例如：围绕秋冬大衣写 3 条口语笔记，语气治愈"
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
  value: string | number | undefined
  disabled?: boolean
  onChange: (v: string | number) => void
}) {
  const chipOptions =
    field.chips?.map(String) ?? field.options ?? []

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
              variant={String(value) === opt ? "default" : "outline"}
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
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          className="min-h-24 rounded-xl"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          className="rounded-xl"
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <Input
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          className="rounded-xl"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
