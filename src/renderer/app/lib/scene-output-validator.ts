import type { Playbook } from "~/services/playbook/types"

const JSON_BLOCK_RE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/
const RAW_JSON_RE = /^\s*[{\[]/

/**
 * 尝试从模型回复中提取 JSON。
 * 支持 markdown 代码块和裸 JSON 两种形式。
 */
function extractJson(content: string): unknown | null {
  const blockMatch = content.match(JSON_BLOCK_RE)
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1])
    } catch { /* fall through */ }
  }
  if (RAW_JSON_RE.test(content)) {
    try {
      return JSON.parse(content.trim())
    } catch { /* fall through */ }
  }
  // 尝试找到第一个 { 到最后一个 } 之间的内容
  const firstBrace = content.indexOf("{")
  const lastBrace = content.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1))
    } catch { /* fall through */ }
  }
  return null
}

/**
 * 检查 JSON 是否包含 outputSchema 中定义的必需字段。
 */
function validateAgainstSchema(
  parsed: unknown,
  schema: NonNullable<Playbook["outputSchema"]>
): string[] {
  if (!schema.properties || typeof parsed !== "object" || parsed === null) {
    return ["输出不是有效的 JSON 对象"]
  }
  const keys = Object.keys(schema.properties)
  const obj = parsed as Record<string, unknown>
  const missing = keys.filter((k) => obj[k] === undefined || obj[k] === null)
  return missing.map((k) => `缺少字段「${k}」`)
}

export interface ValidationResult {
  valid: boolean
  /** 如果输出无效，给模型的追问 prompt */
  followUpPrompt?: string
}

/**
 * 验证场景输出是否符合要求。
 * 返回是否通过 + 不通过时给模型的追问 prompt。
 *
 * @param content - 模型回复的文本
 * @param playbook - 当前场景配置（含 outputSchema）
 * @param maxRetries - 已重试次数（防止无限循环）
 */
export function validateSceneOutput(
  content: string,
  playbook: Playbook | null,
  maxRetries = 1
): ValidationResult {
  // 无 outputSchema 的场景不做自动验证
  if (!playbook?.outputSchema?.properties) {
    return { valid: true }
  }

  // 防止无限循环
  if (maxRetries <= 0) {
    return { valid: true }
  }

  const parsed = extractJson(content)
  if (parsed === null) {
    return {
      valid: false,
      followUpPrompt:
        "你的回复中没有找到有效的 JSON 输出。请严格按要求输出合法 JSON，不要包含 JSON 之外的说明文字。",
    }
  }

  const errors = validateAgainstSchema(parsed, playbook.outputSchema)
  if (errors.length > 0) {
    return {
      valid: false,
      followUpPrompt: `JSON 输出校验失败：${errors.join("；")}。请补全缺失字段后重新输出完整 JSON。`,
    }
  }

  return { valid: true }
}
