import { useEffect, useMemo, useRef, useState } from "react"

import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cn } from "~/lib/utils"
import {
  getRichTextTokenValues,
  recoverRichTextTokenValues,
  renderRichTextTemplate,
  resolveTokenDefs,
  type ResolvedTokenDef,
} from "~/services/playbook/compile-prompt"
import type { InputField } from "~/services/playbook/types"

type TemplateSegment =
  | { type: "text"; text: string }
  | { type: "token"; key: string }

const SLOT_RE = /\{\{(\w+)\}\}/g

function parseTemplate(template: string): TemplateSegment[] {
  const segs: TemplateSegment[] = []
  let lastEnd = 0
  for (const m of template.matchAll(SLOT_RE)) {
    const start = m.index ?? 0
    if (start > lastEnd) {
      segs.push({ type: "text", text: template.slice(lastEnd, start) })
    }
    segs.push({ type: "token", key: m[1] })
    lastEnd = start + m[0].length
  }
  if (lastEnd < template.length) {
    segs.push({ type: "text", text: template.slice(lastEnd) })
  }
  return segs
}

function buildInitialTokens(field: InputField, value: unknown): Record<string, string | number> {
  return getRichTextTokenValues(field, value)
}

export type RichTextFieldProps = {
  field: InputField
  value: string | number | Record<string, string | number> | undefined
  disabled?: boolean
  onChange: (values: Record<string, string | number>) => void
  hint?: string
}

/**
 * 富文本填空：模板文本与输入框/下拉框混排在同一行内。
 */
export function RichTextField({
  field,
  value,
  disabled,
  onChange,
  hint,
}: RichTextFieldProps) {
  const template = field.template ?? ""
  const tokens = useMemo(() => resolveTokenDefs(field), [field])
  const segments = useMemo(() => parseTemplate(template), [template])
  const tokenByKey = useMemo(() => {
    const m = new Map<string, ResolvedTokenDef>()
    for (const t of tokens) m.set(t.key, t)
    return m
  }, [tokens])

  const [values, setValues] = useState<Record<string, string | number>>(() =>
    buildInitialTokens(field, value)
  )

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const emittedValuesRef = useRef<string>(JSON.stringify(values))

  useEffect(() => {
    const key = JSON.stringify(values)
    if (emittedValuesRef.current === key) return
    emittedValuesRef.current = key
    onChangeRef.current(values)
  }, [values])

  useEffect(() => {
    const incoming = JSON.stringify(getRichTextTokenValues(field, value))
    if (incoming === emittedValuesRef.current) return
    emittedValuesRef.current = incoming
    setValues(JSON.parse(incoming) as Record<string, string | number>)
  }, [field, value])

  const updateToken = (key: string, v: string | number) => {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm leading-8">
        {segments.length === 0 ? (
          <span className="text-muted-foreground">
            （未配置模板，请在模板中包含 {`{{tokenKey}}`} 形式的占位符）
          </span>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">
            {segments.map((seg, i) => {
              if (seg.type === "text") {
                return (
                  <span key={i} className="whitespace-pre-wrap">
                    {seg.text}
                  </span>
                )
              }
              const def = tokenByKey.get(seg.key)
              if (!def) {
                return (
                  <span
                    key={i}
                    className="rounded-md bg-destructive/10 px-1.5 text-destructive"
                    title={`未定义的 token: ${seg.key}`}
                  >
                    {`{{${seg.key}}}`}
                  </span>
                )
              }
              return (
                <InlineTokenControl
                  key={`${seg.key}-${i}`}
                  token={def}
                  value={values[seg.key]}
                  disabled={disabled}
                  onChange={(next) => updateToken(seg.key, next)}
                />
              )
            })}
          </div>
        )}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function InlineTokenControl({
  token,
  value,
  disabled,
  onChange,
}: {
  token: ResolvedTokenDef
  value: string | number | undefined
  disabled?: boolean
  onChange: (v: string | number) => void
}) {
  const chipOptions = token.chips?.map((c) => String(c)) ?? []
  const selectOptions =
    token.type === "enum" && token.options?.length
      ? token.options
      : chipOptions.length > 0
        ? chipOptions
        : []

  const filled =
    value !== undefined && value !== null && String(value).trim() !== ""

  const controlClass = cn(
    "inline-flex h-7 align-baseline text-xs shadow-none",
    "border-primary/30 bg-background focus-visible:ring-1",
    disabled && "cursor-not-allowed opacity-50"
  )

  if (selectOptions.length > 0) {
    return (
      <Select
        value={filled ? String(value) : undefined}
        onValueChange={(v) =>
          onChange(token.type === "number" ? Number(v) : v)
        }
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            controlClass,
            "min-w-[4.5rem] w-auto max-w-[10rem] px-2",
            !filled && "border-dashed text-muted-foreground"
          )}
        >
          <SelectValue placeholder={token.label || token.key} />
        </SelectTrigger>
        <SelectContent>
          {selectOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (token.type === "number") {
    return (
      <Input
        type="number"
        disabled={disabled}
        value={value === undefined || value === null ? "" : String(value)}
        placeholder={token.label || token.key}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(controlClass, "w-16 px-2")}
      />
    )
  }

  return (
    <Input
      type="text"
      disabled={disabled}
      value={value === undefined || value === null ? "" : String(value)}
      placeholder={token.label || token.key}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        controlClass,
        "min-w-[5rem] max-w-[12rem] px-2",
        !filled && "border-dashed placeholder:text-muted-foreground/70"
      )}
    />
  )
}

export const __test = {
  parseTemplate,
  recoverTokenValues: recoverRichTextTokenValues,
  renderRichTextTemplate,
}
