import {
  isDashScopeOpenAiBaseUrl,
  listDashScopeOpenAiModelHints,
} from "../shared/coding-plan-catalog"

function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts = [error.message]
  const cause = error.cause
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    parts.push(cause.message)
  }
  const joined = parts.join(" — ")
  if (/certificate|UNABLE_TO_VERIFY|self signed|local issuer/i.test(joined)) {
    return `${joined}。TLS 证书校验失败：可尝试国际节点 https://dashscope-intl.aliyuncs.com/compatible-mode/v1（需 Key 地域匹配），或配置企业/系统根证书。`
  }
  return joined
}

function resolveModelsUrl(base: string): string {
  return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`
}

/** 百炼无 models 列表，但需探测 HTTPS 是否可达（避免对话时才报 Connection error） */
async function probeDashScopeReachability(
  base: string,
  key: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetch(resolveModelsUrl(base), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: formatFetchError(error) }
  }
}

/** 从 OpenAI 兼容 GET /v1/models 拉取模型 id 列表（Coding Plan 多数支持） */
export async function listOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, error: "请先填写 API Key" }
  const base = baseUrl.trim().replace(/\/$/, "")
  if (!base) return { ok: false, error: "请先填写 Base URL" }

  if (isDashScopeOpenAiBaseUrl(base)) {
    const probe = await probeDashScopeReachability(base, key)
    if (!probe.ok) return probe
    return { ok: true, models: listDashScopeOpenAiModelHints() }
  }

  const url = resolveModelsUrl(base)

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
    return { ok: false, error: formatFetchError(error) }
  }
}
