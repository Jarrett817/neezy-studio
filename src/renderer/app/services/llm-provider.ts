import {
  CODING_PLAN_VENDOR_CATALOG,
  defaultModelForPreset,
  getPresetLabel,
  isKnownCodingPlanPreset,
  resolveCatalogBaseUrl,
  type CodingPlanPresetId,
  type CodingPlanVendor,
} from "~/config/llm-presets"

export type LlmProviderKind = "ollama" | "openai-compatible"

/** 内置目录 id 或 custom；亦兼容上游合并后的动态 id */
export type CodingPlanPreset = CodingPlanPresetId | (string & {})

export type { CodingPlanVendor }

export interface LlmProviderConfig {
  kind: LlmProviderKind
  preset: string
  baseUrl: string
  apiKey: string
  model: string
}

export const CODING_PLAN_PRESETS: Record<
  string,
  { label: string; baseUrl: string; modelHint: string }
> = Object.fromEntries(
  CODING_PLAN_VENDOR_CATALOG.map((v) => [
    v.id,
    {
      label: v.label,
      baseUrl: v.baseUrl,
      modelHint: v.modelHints[0] ?? "",
    },
  ])
)

CODING_PLAN_PRESETS.custom = {
  label: "自定义 OpenAI 兼容",
  baseUrl: "",
  modelHint: "如 gpt-4o-mini",
}

export const DEFAULT_LLM_PROVIDER: LlmProviderConfig = {
  kind: "openai-compatible",
  preset: "zhipu-coding",
  baseUrl: CODING_PLAN_PRESETS["zhipu-coding"].baseUrl,
  apiKey: "",
  model: "GLM-4.7",
}

export function resolveProviderBaseUrl(config: LlmProviderConfig): string {
  if (config.kind === "ollama") return ""
  return resolveCatalogBaseUrl(config.preset, config.baseUrl)
}

export { getPresetLabel, isKnownCodingPlanPreset }

export function normalizeLlmProvider(
  partial?: Partial<LlmProviderConfig> | null
): LlmProviderConfig {
  const preset = partial?.preset ?? DEFAULT_LLM_PROVIDER.preset
  const baseFromPreset = resolveCatalogBaseUrl(preset, partial?.baseUrl ?? "")
  return {
    kind: partial?.kind ?? DEFAULT_LLM_PROVIDER.kind,
    preset,
    baseUrl: (partial?.baseUrl?.trim() || baseFromPreset).replace(/\/$/, ""),
    apiKey: partial?.apiKey ?? "",
    model:
      partial?.kind === "ollama"
        ? (partial?.model?.trim() ?? "")
        : partial?.model?.trim() ||
          defaultModelForPreset(preset, DEFAULT_LLM_PROVIDER.model),
  }
}
