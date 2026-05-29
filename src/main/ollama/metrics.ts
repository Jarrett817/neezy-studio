import os from "node:os"

import type { MemoryPressure, RuntimeMetricsBase } from "../types"
import { buildModelRecommendations } from "../model-recommendations"
import {
  catalogItemFromDefinition,
  ensureModelRegistry,
  getAllModelDefinitions,
  isModelInstalled,
  refreshInstalledNames,
} from "./catalog"
import { getOllamaClient } from "./client"
import { ensureOllama, pingOllama } from "./lifecycle"
import { listRunningModels } from "./model-info"

export async function getOllamaRuntimeMetrics(): Promise<
  RuntimeMetricsBase & ReturnType<typeof buildModelRecommendations>
> {
  const totalMemoryGb = os.totalmem() / 1024 ** 3
  const availableMemoryGb = os.freemem() / 1024 ** 3
  const usedRatio =
    totalMemoryGb === 0 ? 0 : 1 - availableMemoryGb / totalMemoryGb
  const pressure: MemoryPressure =
    usedRatio > 0.82 ? "high" : usedRatio > 0.65 ? "medium" : "low"

  let gpuLabel = "Ollama"
  let vramSummary = "由 Ollama 管理显存"
  const inspectLines: string[] = []

  if (await pingOllama()) {
    try {
      const ver = await getOllamaClient().version()
      inspectLines.push(`Ollama ${ver.version ?? "已连接"}`)
      const running = await listRunningModels()
      if (running.length > 0) {
        inspectLines.push(`运行中：${running.map((m) => m.name).join("、")}`)
      }
    } catch {
      inspectLines.push("Ollama API 已连接")
    }
  } else {
    inspectLines.push("Ollama 未运行（启动时将自动拉起）")
    vramSummary = "未连接"
  }

  inspectLines.push(
    `内存：${Math.round(usedRatio * 100)}%（${availableMemoryGb.toFixed(1)}/${totalMemoryGb.toFixed(1)} GB 可用）`
  )

  await ensureOllama().catch(() => {})
  await refreshInstalledNames().catch(() => {})
  await ensureModelRegistry().catch(() => {})

  const base: RuntimeMetricsBase = {
    cpuCount: os.cpus().length,
    cpuUsagePercent: Math.round(os.loadavg()[0] * 100) / 100,
    totalMemoryGb: Math.round(totalMemoryGb * 10) / 10,
    availableMemoryGb: Math.round(availableMemoryGb * 10) / 10,
    pressure,
    gpuLabel,
    vramUsedPercent: 0,
    vramSummary,
    gpuInspectLines: inspectLines,
  }

  const catalog = getAllModelDefinitions()
  return {
    ...base,
    ...buildModelRecommendations({
      metrics: base,
      catalog,
      isInstalled: (m) => isModelInstalled(m.fileName),
    }),
  }
}

export async function getModelCatalogItems(kind?: import("../types").ModelKind) {
  await ensureModelRegistry().catch(() => {})
  const models = kind
    ? getAllModelDefinitions().filter((m) => m.kind === kind)
    : getAllModelDefinitions()
  return models.map((model) => catalogItemFromDefinition(model))
}
