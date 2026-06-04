import type { InputField, InputProfile, Playbook, PlaybookSlots } from "./types"

export type CompilePromptContext = {
  slots: PlaybookSlots
  persona?: string
  retrievedMemories?: string
  skillBlock?: string
}

const SLOT_RE = /\{\{(\w+)\}\}/g

export function compilePrompt(
  profile: InputProfile,
  ctx: CompilePromptContext
): string {
  const vars: Record<string, string> = {
    persona: ctx.persona?.trim() || "（未配置人设）",
    retrievedMemories: ctx.retrievedMemories?.trim() || "（无相关记忆）",
    skillBlock: ctx.skillBlock?.trim() || "",
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
  return [
    basePrompt,
    "",
    `【当前场景】${playbook.name}`,
    playbook.description,
    "用户右侧面板中的参数为任务主输入；聊天框可写补充说明。请产出可直接使用的结果，语气清晰自然。",
  ].join("\n")
}

export function buildLlmMessages(
  compiledUserPrompt: string,
  skillBlock?: string
): { role: "system" | "user"; content: string }[] {
  const systemParts = [
    skillBlock,
    "请严格按用户要求输出；若要求 JSON，只输出合法 JSON，不要 markdown 代码块外的说明。",
  ].filter(Boolean)

  return [
    { role: "system", content: systemParts.join("\n\n") },
    { role: "user", content: compiledUserPrompt },
  ]
}
