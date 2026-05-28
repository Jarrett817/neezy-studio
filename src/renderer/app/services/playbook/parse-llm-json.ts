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
