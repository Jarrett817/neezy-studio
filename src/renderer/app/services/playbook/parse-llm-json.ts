import { z } from "zod"

export function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence?.[1]?.trim() ?? trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf("{")
    const arrStart = candidate.indexOf("[")
    const pick =
      start >= 0 && (arrStart < 0 || start < arrStart) ? start : arrStart
    if (pick < 0) throw new Error("模型未返回可解析的 JSON")
    const slice = candidate.slice(pick)
    return JSON.parse(slice)
  }
}

/**
 * 根据 playbook.outputSchema.properties（JSON Schema → Zod）校验并归一化输出。
 * 若无 outputSchema 或校验失败，返回 null（调用方用 rawText 兜底）。
 */
export function validateOutputSchema(
  parsed: unknown,
  properties: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!properties || Object.keys(properties).length === 0) return null
  if (typeof parsed !== "object" || parsed === null) return null

  const buildZodSchema = (
    jschema: Record<string, unknown>
  ): z.ZodType<unknown> => {
    const type = String(jschema.type ?? "any")
    switch (type) {
      case "object": {
        const fields = (jschema.properties as Record<string, unknown> | undefined) ?? {}
        const shape: Record<string, z.ZodType<unknown>> = {}
        for (const [k, v] of Object.entries(fields)) {
          shape[k] = buildZodSchema(v as Record<string, unknown>)
        }
        return z.object(shape)
      }
      case "array": {
        const items = jschema.items as Record<string, unknown> | undefined
        return z.array(items ? buildZodSchema(items) : z.any())
      }
      case "string":
        return z.string()
      case "number":
        return z.number()
      case "boolean":
        return z.boolean()
      default:
        return z.any()
    }
  }

  try {
    const schema = buildZodSchema({ type: "object", properties })
    const result = schema.parse(parsed)
    return result as Record<string, unknown>
  } catch {
    return null
  }
}
