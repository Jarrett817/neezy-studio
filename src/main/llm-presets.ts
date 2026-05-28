import {
  resolveCatalogBaseUrl,
  type CodingPlanPresetId,
} from "../shared/coding-plan-catalog"
import type { LlmProviderConfig } from "./runtime-settings"

export {
  CODING_PLAN_VENDOR_CATALOG,
  getPresetLabel,
  resolveCatalogBaseUrl,
} from "../shared/coding-plan-catalog"

export function resolveProviderBaseUrl(config: LlmProviderConfig): string {
  return resolveCatalogBaseUrl(config.preset, config.baseUrl)
}

export type { CodingPlanPresetId }
