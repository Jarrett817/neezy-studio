import { useEffect, useMemo, useRef, useState } from "react"
import { Hash } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cn } from "~/lib/utils"
import {
  extractTemplateTokens,
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

/**
 * 从已渲染字符串反推 token 值。失败返回 null（不修改原值）。
 */
function recoverTokenValues(
  template: string,
  rendered: string,
  tokens: ResolvedTokenDef[]
): Record<string, string | number> | null {
  if (!template) return null
  const segs = parseTemplate(template)
  const values: Record<string, string | number> = {}
  let pos = 0
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j]
    if (s.type === "text") {
      if (rendered.slice(pos, pos + s.text.length) !== s.text) return null
      pos += s.text.length
    } else {
      const next = segs[j + 1]
      const nextText = next && next.type === "text" ? next.text : ""
      let val: string
      if (nextText) {
        const idx = rendered.indexOf(nextText, pos)
        if (idx < 0) return null
        val = rendered.slice(pos, idx)
        pos = idx
      } else {
        val = rendered.slice(pos)
        pos = rendered.length
      }
      const def = tokens.find((t) => t.key === s.key)
      if (def?.type === "number") {
        const n = Number(val)
        values[s.key] = Number.isNaN(n) ? val : n
      } else {
        values[s.key] = val
      }
    }
  }
  if (pos !== rendered.length) return null
  for (const t of tokens) {
    if (values[t.key] === undefined) return null
  }
  return values
}

function buildInitialTokens(
  template: string,
  value: unknown,
  tokens: ResolvedTokenDef[]
): Record<string, string | number> {
  if (typeof value === "string" && value) {
    const recovered = recoverTokenValues(template, value, tokens)
    if (recovered) return recovered
  }
  const init: Record<string, string | number> = {}
  for (const t of tokens) {
    init[t.key] = t.default ?? ""
  }
  return init
}

export type RichTextFieldProps = {
  field: InputField
  value: string | number | undefined
  disabled?: boolean
  onChange: (rendered: string) => void
  /** 字段粒度提示文本（label 旁的副文案） */
  hint?: string
}

/**
 * 富文本填空：渲染 {{token}} 模板，token 是可点击的 chip。
 * 点击 chip 弹出 Popover 让用户选择/输入值。
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
    buildInitialTokens(template, value, tokens)
  )
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    if (typeof value === "string" && value) {
      const recovered = recoverTokenValues(template, value, tokens)
      if (recovered) {
        setValues(recovered)
      }
    }
  }, [value, template, tokens])

  const rendered = useMemo(
    () => renderRichTextTemplate(template, values),
    [template, values]
  )

  // 把渲染结果回写到父组件（debounce 一帧避免 render 中调用）
  useEffect(() => {
    onChange(rendered)
  }, [rendered, onChange])

  const updateToken = (key: string, v: string | number) => {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-3 text-sm leading-relaxed">
        {segments.length === 0 ? (
          <span className="text-muted-foreground">
            （未配置模板，请在模板中包含 {`{{tokenKey}}`} 形式的占位符）
          </span>
        ) : (
          segments.map((seg, i) => {
            if (seg.type === "text") {
              return <span key={i}>{seg.text}</span>
            }
            const def = tokenByKey.get(seg.key)
            if (!def) {
              return (
                <span
                  key={i}
                  className="mx-0.5 rounded-md bg-destructive/10 px-1.5 text-destructive"
                  title={`未定义的 token: ${seg.key}`}
                >
                  {`{{${seg.key}}}`}
                </span>
              )
            }
            const v = values[seg.key]
            const filled =
              v !== undefined && v !== null && String(v).trim() !== ""
            return (
              <TokenChipPopover
                key={`${seg.key}-${i}`}
                token={def}
                value={v}
                disabled={disabled}
                onChange={(next) => updateToken(seg.key, next)}
                filled={Boolean(filled)}
              />
            )
          })
        )}
      </div>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {tokens.some((t) => t.chips?.length || t.options?.length) ? (
        <p className="text-xs text-muted-foreground">
          点击模板中的
          <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            <Hash className="size-2.5" />
            token
          </span>
          选填；带候选的 token 也可点下方按钮快速设置。
        </p>
      ) : null}
    </div>
  )
}

function TokenChipPopover({
  token,
  value,
  disabled,
  onChange,
  filled,
}: {
  token: ResolvedTokenDef
  value: string | number | undefined
  disabled?: boolean
  onChange: (v: string | number) => void
  filled: boolean
}) {
  const chipOptions =
    token.chips?.map((c) => String(c)) ?? token.options ?? []
  const display = filled ? String(value) : token.label || token.key

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "mx-0.5 inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            filled
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-dashed border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <Hash className="size-3" />
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{token.label || token.key}</p>
            {token.hint ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {token.hint}
              </p>
            ) : null}
          </div>
          {chipOptions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chipOptions.map((opt) => {
                const isActive = String(value) === opt
                return (
                  <Button
                    key={opt}
                    type="button"
                    size="xs"
                    variant={isActive ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => {
                      onChange(token.type === "number" ? Number(opt) : opt)
                    }}
                  >
                    {opt}
                  </Button>
                )
              })}
            </div>
          ) : null}
          {token.type === "enum" && token.options?.length ? (
            <Select
              value={
                value !== undefined && value !== null ? String(value) : ""
              }
              onValueChange={(v) => onChange(v)}
            >
              <SelectTrigger className="h-9 w-full rounded-lg">
                <SelectValue placeholder={`选择 ${token.label || token.key}`} />
              </SelectTrigger>
              <SelectContent>
                {token.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={value === undefined || value === null ? "" : String(value)}
              type={token.type === "number" ? "number" : "text"}
              placeholder={token.label || token.key}
              onChange={(e) => {
                const raw = e.target.value
                onChange(token.type === "number" ? Number(raw) : raw)
              }}
              className="h-9 rounded-lg"
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 预留工具：导出供测试
export const __test = { parseTemplate, recoverTokenValues, extractTemplateTokens }
