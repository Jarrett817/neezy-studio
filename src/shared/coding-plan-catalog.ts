/**
 * Coding Plan / OpenAI 兼容厂商目录。
 * 数据来源对齐 VS Code 扩展 jqknono/coding-plans-for-copilot 默认 vendors；
 * 可通过 refreshCodingPlanCatalogFromUpstream() 从上游 package.json 合并更新。
 */

export interface CodingPlanVendor {
  id: string
  label: string
  baseUrl: string
  /** 仅 UI 示例，不保证与厂商当前可用模型一致 */
  modelHints: string[]
  usageUrl?: string
  docsUrl?: string
}

export const CODING_PLAN_CATALOG_VERSION = 1

export const CODING_PLAN_VENDOR_CATALOG: CodingPlanVendor[] = [
  {
    id: "zhipu-coding",
    label: "智谱 GLM Coding Plan",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    modelHints: ["GLM-4.7", "GLM-4.6"],
    usageUrl: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
  },
  {
    id: "zai-coding",
    label: "Z.AI Coding Plan",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    modelHints: ["GLM-4.7"],
    docsUrl: "https://docs.z.ai/devpack/overview",
  },
  {
    id: "xfyun-coding",
    label: "讯飞星辰 Coding Plan",
    baseUrl: "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
    modelHints: ["astron-code-latest"],
  },
  {
    id: "volcengine-coding",
    label: "火山引擎 Coding Plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    modelHints: ["doubao-seed-code"],
  },
  {
    id: "kimi-coding",
    label: "Kimi Coding Plan",
    baseUrl: "https://api.kimi.com/coding/v1",
    modelHints: ["kimi-for-coding"],
  },
  {
    id: "aliyun-coding",
    label: "阿里云 Coding Plan",
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
    modelHints: ["qwen3-coder-plus"],
  },
  {
    id: "openrouter-coding",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api",
    modelHints: ["anthropic/claude-sonnet-4"],
  },
  {
    id: "tencent-coding",
    label: "腾讯 Coding Plan",
    baseUrl: "https://api.lkeap.cloud.tencent.com/plan/anthropic",
    modelHints: ["claude-sonnet-4"],
  },
  {
    id: "mimo-coding",
    label: "小米 MiMo Coding Plan",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    modelHints: ["mimo-v2-flash"],
  },
  {
    id: "deepseek-coding",
    label: "DeepSeek Coding Plan",
    baseUrl: "https://api.deepseek.com/anthropic",
    modelHints: ["deepseek-chat"],
  },
  {
    id: "minimax-coding",
    label: "MiniMax Coding Plan",
    baseUrl: "https://api.minimaxi.com/anthropic",
    modelHints: ["MiniMax-M2.7"],
  },
]

const CATALOG_BY_ID = new Map(CODING_PLAN_VENDOR_CATALOG.map((v) => [v.id, v]))

export type CodingPlanPresetId = (typeof CODING_PLAN_VENDOR_CATALOG)[number]["id"] | "custom"

export function isKnownCodingPlanPreset(id: string): id is CodingPlanPresetId {
  return id === "custom" || CATALOG_BY_ID.has(id)
}

export function getCodingPlanVendor(id: string): CodingPlanVendor | undefined {
  return CATALOG_BY_ID.get(id)
}

export function resolveCatalogBaseUrl(preset: string, customUrl: string): string {
  if (preset === "custom") return customUrl.trim().replace(/\/$/, "")
  const vendor = CATALOG_BY_ID.get(preset)
  return vendor?.baseUrl ?? customUrl.trim().replace(/\/$/, "")
}

export function getPresetLabel(preset: string): string {
  if (preset === "custom") return "自定义"
  return CATALOG_BY_ID.get(preset)?.label ?? preset
}

export function defaultModelForPreset(preset: string, fallback: string): string {
  if (preset === "custom") return fallback
  const hints = CATALOG_BY_ID.get(preset)?.modelHints
  return hints?.[0] ?? fallback
}

/** 从 jqknono/coding-plans-for-copilot 的 package.json 拉取默认 vendors 并合并 */
export async function refreshCodingPlanCatalogFromUpstream(): Promise<CodingPlanVendor[]> {
  const res = await fetch(
    "https://raw.githubusercontent.com/jqknono/coding-plans-for-copilot/main/package.json",
    { signal: AbortSignal.timeout(12_000) }
  )
  if (!res.ok) throw new Error(`拉取上游目录失败 (${res.status})`)
  const pkg = (await res.json()) as {
    contributes?: {
      configuration?: {
        properties?: {
          "coding-plans.vendors"?: { default?: UpstreamVendor[] }
        }
      }
    }
  }
  const upstream = pkg.contributes?.configuration?.properties?.["coding-plans.vendors"]?.default
  if (!Array.isArray(upstream) || upstream.length === 0) {
    throw new Error("上游目录为空")
  }
  return upstream.map((v) => upstreamVendorToCatalog(v))
}

type UpstreamVendor = {
  name?: string
  baseUrl?: string
  usageUrl?: string
  models?: { id?: string }[]
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function upstreamVendorToCatalog(v: UpstreamVendor): CodingPlanVendor {
  const label = v.name?.trim() || "Unknown"
  const id = `${slugify(label)}-coding`
  const modelHints = (v.models ?? [])
    .map((m) => m.id?.trim())
    .filter((id): id is string => Boolean(id))
  return {
    id,
    label,
    baseUrl: (v.baseUrl ?? "").replace(/\/$/, ""),
    modelHints: modelHints.length > 0 ? modelHints : ["见厂商文档"],
    usageUrl: v.usageUrl,
  }
}

export function mergeCatalogVendors(
  base: CodingPlanVendor[],
  incoming: CodingPlanVendor[]
): CodingPlanVendor[] {
  const map = new Map(base.map((v) => [v.id, v]))
  for (const v of incoming) {
    if (!v.baseUrl) continue
    map.set(v.id, { ...map.get(v.id), ...v })
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
}
