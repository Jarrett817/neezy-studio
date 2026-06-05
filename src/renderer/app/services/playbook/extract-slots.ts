import { promptAgentOnce } from "~/services/agent-prompt"

import { parseJsonFromLlm } from "./parse-llm-json"
import type { InputField, InputProfile, PlaybookSlots } from "./types"

export class SlotValidationError extends Error {
  readonly missingKeys: string[]

  constructor(missingKeys: string[]) {
    super(`缺少必填项：${missingKeys.join("、")}`)
    this.name = "SlotValidationError"
    this.missingKeys = missingKeys
  }
}

function defaultForField(field: InputField): string | number | undefined {
  if (field.default !== undefined) return field.default
  if (field.type === "number" && field.chips?.length) {
    return Number(field.chips[0])
  }
  return undefined
}

export function normalizeSlots(
  profile: InputProfile,
  raw: Record<string, unknown>
): PlaybookSlots {
  const slots: PlaybookSlots = {}

  for (const field of profile.fields) {
    const incoming = raw[field.key]
    if (incoming !== undefined && incoming !== null && incoming !== "") {
      if (field.type === "mindmap" || field.type === "flowchart") {
        slots[field.key] = incoming as PlaybookSlots[string]
      } else {
        slots[field.key] =
          field.type === "number" ? Number(incoming) : String(incoming)
      }
      continue
    }
    const fallback = defaultForField(field)
    if (fallback !== undefined) slots[field.key] = fallback
  }

  if (raw.extra !== undefined) slots.extra = String(raw.extra)
  if (raw.references !== undefined) slots.references = String(raw.references)

  const missing = profile.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = slots[f.key]
      if (f.type === "mindmap") {
        const node = v as { topic?: string } | undefined
        return !node?.topic?.trim()
      }
      if (f.type === "flowchart") {
        const graph = v as { nodes?: unknown[] } | undefined
        return !graph?.nodes?.length
      }
      return v === undefined || v === null || String(v).trim() === ""
    })
    .map((f) => f.key)

  if (missing.length > 0) throw new SlotValidationError(missing)

  return slots
}

export async function extractSlotsFromSingleLine(
  profile: InputProfile,
  line: string
): Promise<PlaybookSlots> {
  const trimmed = line.trim()
  if (!trimmed) throw new Error("请输入一句话描述")

  const fieldSpec = profile.fields
    .map((f) => {
      const req = f.required ? "必填" : "可选"
      const extra =
        f.chips?.length || f.options?.length
          ? ` 选项:${(f.chips ?? f.options)?.join("/")}`
          : ""
      return `${f.key}（${f.label}，${req}${extra}）`
    })
    .join("；")

  const { content: raw } = await promptAgentOnce([
    {
      role: "system",
      content:
        "你是槽位抽取器。根据用户一句话填充 JSON 对象，键为字段 key，值为字符串或数字。只输出合法 JSON，不要 markdown。",
    },
    {
      role: "user",
      content: `字段定义：${fieldSpec}\n\n用户输入：${trimmed}`,
    },
  ])

  const parsed = parseJsonFromLlm(raw) as Record<string, unknown>
  return normalizeSlots(profile, { ...parsed, extra: parsed.extra ?? trimmed })
}

export {
  loadInputSceneSlots,
  saveInputSceneSlots,
  loadLastPlaybookSlots,
  saveLastPlaybookSlots,
} from "./input-scene-storage"

export function buildMemoryQuery(slots: PlaybookSlots): string {
  const parts = ["topic", "title", "query", "content", "extra", "references"]
    .map((k) => slots[k])
    .filter((v) => v !== undefined && String(v).trim() !== "")
    .map((v) => String(v).trim())

  return parts.join(" ") || "运营素材"
}
