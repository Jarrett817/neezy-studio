import os from "node:os"

import { getEmbeddingStatus } from "./embedding-runtime"
import type { RuntimeMetricsBase } from "./types"

export async function getRuntimeMetrics(): Promise<RuntimeMetricsBase> {
  const totalMemoryGb = os.totalmem() / 1024 ** 3
  const availableMemoryGb = os.freemem() / 1024 ** 3
  const pressure =
    availableMemoryGb < 2 ? "high" : availableMemoryGb < 4 ? "medium" : "low"
  const emb = getEmbeddingStatus()
  const gpuInspectLines = [
    emb.loaded
      ? `Embedding 已加载${emb.filePath ? `: ${emb.filePath}` : ""}`
      : "Embedding 未加载（记忆向量检索需内置模型）",
  ]

  return {
    cpuCount: os.cpus().length,
    cpuUsagePercent: 0,
    totalMemoryGb,
    availableMemoryGb,
    pressure,
    gpuInspectLines,
  }
}
