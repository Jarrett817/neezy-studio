/** 从 OpenAI 兼容 GET /v1/models 拉取模型 id 列表（Coding Plan 多数支持） */
export async function listOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, error: "请先填写 API Key" }
  const base = baseUrl.trim().replace(/\/$/, "")
  if (!base) return { ok: false, error: "请先填写 Base URL" }
  const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        ok: false,
        error: text.slice(0, 200) || `HTTP ${res.status}`,
      }
    }
    const data = (await res.json()) as { data?: { id?: string }[] }
    const models = [...new Set((data.data ?? []).map((m) => m.id?.trim()).filter(Boolean) as string[])].sort()
    if (!models.length) return { ok: false, error: "接口未返回模型列表" }
    return { ok: true, models }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
