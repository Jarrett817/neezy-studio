import type { InputField, InputProfile, Playbook, PlaybookSlots } from "./types"
import { flowchartToText, mindmapToJson } from "./graph-serializers"

const SLOT_RE = /\{\{(\w+)\}\}/g

type TemplateSegment =
  | { type: "text"; text: string }
  | { type: "token"; key: string }

function parseRichTextTemplate(template: string): TemplateSegment[] {
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

/** 从已渲染字符串反推 token 值；失败返回 null */
export function recoverRichTextTokenValues(
  template: string,
  rendered: string,
  tokens: ResolvedTokenDef[]
): Record<string, string | number> | null {
  if (!template) return null
  const segs = parseRichTextTemplate(template)
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

export function getRichTextTokenValues(
  field: InputField,
  v: unknown
): Record<string, string | number> {
  const tokens = resolveTokenDefs(field)
  const template = field.template ?? ""
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, string | number>
  }
  if (typeof v === "string" && v.trim()) {
    const recovered = recoverRichTextTokenValues(template, v, tokens)
    if (recovered) return recovered
  }
  const init: Record<string, string | number> = {}
  for (const t of tokens) {
    init[t.key] = t.default ?? ""
  }
  return init
}

function validateRichTextField(field: InputField, v: unknown): boolean {
  const tokens = resolveTokenDefs(field)
  const values = getRichTextTokenValues(field, v)
  const requiredTokens = tokens.filter((t) => t.required)
  const toCheck = requiredTokens.length > 0 ? requiredTokens : field.required ? tokens : []
  if (toCheck.length === 0) return true
  return toCheck.every((t) => {
    const tv = values[t.key]
    return tv !== undefined && tv !== null && String(tv).trim() !== ""
  })
}

/** 校验场景表单必填项（含 rich-text 内 token） */
export function validateProfileSlots(
  profile: InputProfile,
  slots: Record<string, unknown>
): boolean {
  for (const f of profile.fields) {
    if (!f.required) continue
    const v = slots[f.key]
    if (f.type === "mindmap") {
      if (!(v as { topic?: string })?.topic?.trim()) return false
      continue
    }
    if (f.type === "flowchart") {
      if (!(v as { nodes?: unknown[] })?.nodes?.length) return false
      continue
    }
    if (f.type === "rich-text") {
      if (!validateRichTextField(f, v)) return false
      continue
    }
    if (v === undefined || v === null || String(v).trim() === "") return false
  }
  return true
}

export type CompilePromptContext = {
  slots: PlaybookSlots
  persona?: string
  retrievedMemories?: string
}

export function compilePrompt(
  profile: InputProfile,
  ctx: CompilePromptContext
): string {
  const vars: Record<string, string> = {
    persona: ctx.persona?.trim() || "（未配置人设）",
    retrievedMemories: ctx.retrievedMemories?.trim() || "（无相关记忆）",
    extra: String(ctx.slots.extra ?? ctx.slots.references ?? "").trim(),
  }

  for (const field of profile.fields) {
    const v = ctx.slots[field.key]
    vars[field.key] = renderFieldValue(field, v)
  }

  return profile.promptTemplate.replace(SLOT_RE, (_, key: string) => {
    return vars[key] ?? ""
  })
}

/**
 * 把字段值渲染为最终字符串。
 * rich-text 字段支持「已渲染字符串」或「token 值对象」两种内部表示。
 */
export function renderFieldValue(
  field: InputField,
  v: unknown
): string {
  if (field.type === "rich-text" && field.template) {
    if (typeof v === "string") return v
    if (v && typeof v === "object") {
      return renderRichTextTemplate(
        field.template,
        v as Record<string, string | number | undefined>
      )
    }
    return ""
  }
  if (field.type === "mindmap") {
    const json = mindmapToJson(v)
    return json ? `\`\`\`json\n${json}\n\`\`\`` : ""
  }
  if (field.type === "flowchart") {
    return flowchartToText(v)
  }
  if (v === undefined || v === null) return ""
  return String(v).trim()
}

/**
 * 渲染 rich-text 模板：把 {{token}} 替换为用户填入的值。
 * 未填值的 token 渲染为空字符串（不会留占位符）。
 */
export function renderRichTextTemplate(
  template: string,
  values: Record<string, string | number | undefined>
): string {
  return template.replace(SLOT_RE, (_, key: string) => {
    const v = values[key]
    if (v === undefined || v === null) return ""
    return String(v).trim()
  })
}

/**
 * 从 template 中提取所有 {{token}} 的 key（按出现顺序、去重）。
 */
export function extractTemplateTokens(template: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const match of template.matchAll(SLOT_RE)) {
    const k = match[1]
    if (!seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  return keys
}

export type ResolvedTokenDef = {
  key: string
  label: string
  type: "text" | "number" | "enum"
  options?: string[]
  chips?: Array<string | number>
  required?: boolean
  default?: string | number
  hint?: string
}

/**
 * 根据 template + tokenDefs 派生最终 token 列表。
 * 自动从模板中提取未在 tokenDefs 中显式定义的 token，缺省按 text 处理。
 */
export function resolveTokenDefs(field: InputField): ResolvedTokenDef[] {
  const template = field.template
  if (!template) return []
  const fromTemplate = extractTemplateTokens(template)
  const defined = new Map((field.tokenDefs ?? []).map((t) => [t.key, t]))
  return fromTemplate.map((key) => {
    const def = defined.get(key)
    return {
      key,
      label: def?.label ?? key,
      type: (def?.type ?? "text") as "text" | "number" | "enum",
      options: def?.options,
      chips: def?.chips,
      required: def?.required,
      default: def?.default,
      hint: def?.hint,
    }
  })
}

export function buildSceneAgentSystemPrompt(
  basePrompt: string,
  playbook: Playbook
): string {
  const memoryHint = playbook.memoryScope
    ? `如果用户的需求与记忆/知识库相关，主动调用 memory_search 搜索相关内容来丰富产出。可搜索多次、用不同关键词扩大范围。`
    : ""
  return [
    basePrompt,
    "",
    `【当前场景】${playbook.name}`,
    playbook.description,
    "右侧面板参数会作为隐藏上下文随每条用户消息一并发送；聊天框仅写补充说明。请产出可直接使用的结果，语气清晰自然。",
    memoryHint,
    playbook.outputSchema?.properties
      ? `输出要求：请以 JSON 格式输出，必须包含字段：${Object.keys(playbook.outputSchema.properties).join("、")}。`
      : "",
  ].filter(Boolean).join("\n")
}

export function buildLlmMessages(
  compiledUserPrompt: string
): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content:
        "请严格按用户要求输出；若要求 JSON，只输出合法 JSON，不要 markdown 代码块外的说明。",
    },
    { role: "user", content: compiledUserPrompt },
  ]
}
