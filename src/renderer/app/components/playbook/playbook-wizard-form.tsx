import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { RichTextField } from "~/components/playbook/RichTextField"
import { cn } from "~/lib/utils"
import {
  extractSlotsFromSingleLine,
  loadInputSceneSlots,
  saveInputSceneSlots,
  type InputField,
  type InputProfile,
} from "~/services/playbook"

type PlaybookWizardFormProps = {
  profileId: string
  profile: InputProfile
  disabled?: boolean
  formId?: string
  onSubmit: (values: Record<string, unknown>) => void
  onValuesChange?: (values: Record<string, unknown>) => void
}

export function PlaybookWizardForm({
  profileId,
  profile,
  disabled,
  formId = "playbook-run-form",
  onSubmit,
  onValuesChange,
}: PlaybookWizardFormProps) {
  const fields = profile.fields
  const capture = profile.capture ?? ["form"]
  const showSingleLine = capture.includes("singleLineExtract")

  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const v: Record<string, string | number> = {}
    for (const field of fields) {
      if (field.default !== undefined) v[field.key] = field.default
    }
    return v
  })
  const [draftReady, setDraftReady] = useState(false)
  const [singleLine, setSingleLine] = useState("")
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDraftReady(false)
    void (async () => {
      const last = await loadInputSceneSlots(profileId)
      if (cancelled) return
      const next: Record<string, string | number> = {}
      for (const field of fields) {
        if (field.default !== undefined) next[field.key] = field.default
      }
      if (last) {
        for (const field of fields) {
          const prev = last[field.key]
          if (typeof prev === "string" || typeof prev === "number") {
            next[field.key] = prev
          }
        }
      }
      setValues(next)
      setDraftReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [fields, profileId])

  useEffect(() => {
    if (!draftReady) return
    onValuesChange?.(values)
    void saveInputSceneSlots(profileId, values)
  }, [values, onValuesChange, profileId, draftReady])

  // 富文本字段不分步：单步内联展示
  const hasRichText = fields.some((f) => f.type === "rich-text")
  if (hasRichText) {
    return <InlineRichTextForm {...{ profileId, profile, disabled, formId, onSubmit, onValuesChange, fields, values, setValues, showSingleLine, singleLine, setSingleLine, extracting, setExtracting }} />
  }

  const totalSteps = fields.length
  const field = fields[step]

  const handleExtract = async () => {
    if (!singleLine.trim()) {
      toast.error("请先输入一句话描述")
      return
    }
    setExtracting(true)
    try {
      const slots = await extractSlotsFromSingleLine(profile, singleLine)
      const next: Record<string, string | number> = { ...values }
      for (const f of fields) {
        const v = slots[f.key]
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          next[f.key] = f.type === "number" ? Number(v) : String(v)
        }
      }
      setValues(next)
      toast.success("已填入识别到的字段")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "识别失败")
    } finally {
      setExtracting(false)
    }
  }

  const submit = () => {
    void saveInputSceneSlots(profileId, values)
    onSubmit(values)
  }

  return (
    <form
      id={formId}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (step < totalSteps - 1) {
          setStep((s) => s + 1)
          return
        }
        submit()
      }}
    >
      {showSingleLine && step === 0 ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
          <Label className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-primary" />
            一句话填表（可选）
          </Label>
          <div className="flex gap-2">
            <Input
              value={singleLine}
              disabled={disabled || extracting}
              className="rounded-xl"
              placeholder="描述你想创作的内容"
              onChange={(e) => setSingleLine(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-xl"
              disabled={disabled || extracting || !singleLine.trim()}
              onClick={() => void handleExtract()}
            >
              {extracting ? <Loader2 className="size-4 animate-spin" /> : "识别"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            步骤 {step + 1} / {totalSteps}
          </span>
          <span>{field?.label}</span>
        </div>
        <div className="flex gap-1">
          {fields.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {field ? (
        <WizardField
          field={field}
          value={values[field.key]}
          disabled={disabled}
          onChange={(next) =>
            setValues((prev) => ({ ...prev, [field.key]: next }))
          }
        />
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 rounded-2xl"
          disabled={disabled || step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft className="size-4" />
          上一步
        </Button>
        <Button
          type="submit"
          className="h-11 flex-[2] rounded-2xl"
          disabled={disabled}
        >
          {step < totalSteps - 1 ? (
            <>
              下一步
              <ChevronRight className="size-4" />
            </>
          ) : (
            "开始生成"
          )}
        </Button>
      </div>
    </form>
  )
}

function WizardField({
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
  const chipOptions = field.chips?.map(String) ?? field.options ?? []

  if (field.type === "rich-text") {
    return (
      <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <Label className="text-base font-medium">
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <RichTextField
          field={field}
          value={value}
          disabled={disabled}
          onChange={(rendered) => onChange(rendered)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <Label className="text-base font-medium">
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
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
          className="min-h-32 rounded-xl text-base"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          className="h-12 rounded-xl text-base"
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <Input
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          className="h-12 rounded-xl text-base"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

// 富文本字段的内联（不分步）表单
function InlineRichTextForm({
  profileId,
  profile,
  disabled,
  formId,
  onSubmit,
  onValuesChange,
  fields,
  values,
  setValues,
  showSingleLine,
  singleLine,
  setSingleLine,
  extracting,
  setExtracting,
}: {
  profileId: string
  profile: InputProfile
  disabled?: boolean
  formId: string
  onSubmit: (values: Record<string, unknown>) => void
  onValuesChange?: (values: Record<string, unknown>) => void
  fields: InputField[]
  values: Record<string, string | number>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number>>>
  showSingleLine: boolean
  singleLine: string
  setSingleLine: (s: string) => void
  extracting: boolean
  setExtracting: (b: boolean) => void
}) {
  const handleExtract = async () => {
    if (!singleLine.trim()) {
      toast.error("请先输入一句话描述")
      return
    }
    setExtracting(true)
    try {
      const slots = await extractSlotsFromSingleLine(profile, singleLine)
      const next: Record<string, string | number> = { ...values }
      for (const f of fields) {
        const v = slots[f.key]
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          next[f.key] = f.type === "number" ? Number(v) : String(v)
        }
      }
      setValues(next)
      toast.success("已填入识别到的字段")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "识别失败")
    } finally {
      setExtracting(false)
    }
  }

  return (
    <form
      id={formId}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        void saveInputSceneSlots(profileId, values)
        onSubmit(values)
      }}
    >
      {showSingleLine ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
          <Label className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-primary" />
            一句话填表（可选）
          </Label>
          <div className="flex gap-2">
            <Input
              value={singleLine}
              disabled={disabled || extracting}
              className="rounded-xl"
              placeholder="描述你想创作的内容"
              onChange={(e) => setSingleLine(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-xl"
              disabled={disabled || extracting || !singleLine.trim()}
              onClick={() => void handleExtract()}
            >
              {extracting ? <Loader2 className="size-4 animate-spin" /> : "识别"}
            </Button>
          </div>
        </div>
      ) : null}

      {fields.map((field) => (
        <FieldBlockRichText
          key={field.key}
          field={field}
          value={values[field.key]}
          disabled={disabled}
          onChange={(next) =>
            setValues((prev) => ({ ...prev, [field.key]: next }))
          }
        />
      ))}

      <Button
        type="submit"
        className="h-12 w-full rounded-2xl text-base"
        disabled={disabled}
      >
        开始生成
      </Button>
    </form>
  )
}

function FieldBlockRichText({
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
  return (
    <div className="space-y-2">
      <Label>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <RichTextField
        field={field}
        value={value}
        disabled={disabled}
        onChange={(rendered) => onChange(rendered)}
      />
    </div>
  )
}
