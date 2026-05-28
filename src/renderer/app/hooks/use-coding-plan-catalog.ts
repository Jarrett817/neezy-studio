import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  CODING_PLAN_VENDOR_CATALOG,
  mergeCatalogVendors,
  refreshCodingPlanCatalogFromUpstream,
  type CodingPlanVendor,
} from "~/config/llm-presets"

const STORAGE_KEY = "neezy:coding-plan-catalog-extra"

function readStoredExtra(): CodingPlanVendor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CodingPlanVendor[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useCodingPlanCatalog() {
  const [extra, setExtra] = useState<CodingPlanVendor[]>(readStoredExtra)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const vendors = useMemo(
    () => mergeCatalogVendors(CODING_PLAN_VENDOR_CATALOG, extra),
    [extra]
  )

  const refreshFromUpstream = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const incoming = await refreshCodingPlanCatalogFromUpstream()
      setExtra(incoming)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming))
      toast.success(`已更新厂商目录（${incoming.length} 项，来源：coding-plans-for-copilot）`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新目录失败")
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  return { vendors, refreshFromUpstream, isRefreshing }
}
