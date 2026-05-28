import type { InputProfile, PlaybookSlots } from "./types"

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
    vars[field.key] =
      v === undefined || v === null ? "" : String(v).trim()
  }

  return profile.promptTemplate.replace(SLOT_RE, (_, key: string) => {
    return vars[key] ?? ""
  })
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
