import { BUILTIN_INPUT_PROFILES } from "./builtin-manifest"
import { compilePrompt } from "./compile-prompt"
import type { CompilePromptContext } from "./compile-prompt"
import type { InputProfile } from "./types"

const BUILTIN_IDS = new Set(BUILTIN_INPUT_PROFILES.map((p) => p.id))

export function isBuiltinInputProfile(id: string): boolean {
  return BUILTIN_IDS.has(id)
}

export function previewCompilePrompt(
  profile: InputProfile,
  sampleSlots: Record<string, string | number>
): string {
  const ctx: CompilePromptContext = {
    slots: sampleSlots,
    persona: "（示例人设摘要）",
    retrievedMemories: "（示例记忆条目）",
    skillBlock: "（示例 Skill 指令）",
  }
  return compilePrompt(profile, ctx)
}
