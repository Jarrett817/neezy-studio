import os from "node:os"

import { importNlcDistModule } from "./nlc-dist-loader"
import { getLlamaModule } from "./node-llama-runtime"

type LlamaGpu = false | "cuda" | "vulkan" | "metal"

function formatVramBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export interface GpuRuntimeDisplay {
  gpuLabel: string
  vramSummary: string
  vramUsedPercent: number
  inspectLines: string[]
}

async function tryProductionLlama() {
  const { getLlama, LlamaLogLevel } = await getLlamaModule()
  try {
    return await getLlama({
      build: "never",
      progressLogs: false,
      logLevel: LlamaLogLevel.warn,
    })
  } catch {
    return null
  }
}

/** 与 `npx node-llama-cpp inspect gpu` + 官方 getLlama() 自动选型一致 */
export async function getGpuRuntimeDisplay(): Promise<GpuRuntimeDisplay> {
  const { detectAvailableComputeLayers } = await importNlcDistModule<{
    detectAvailableComputeLayers: (opts: { platform: string }) => Promise<{
      cuda: { hasNvidiaDriver: boolean; hasCudaRuntime: boolean }
      vulkan: boolean
    }>
  }>("bindings", "utils", "detectAvailableComputeLayers.js")
  const { getPrettyBuildGpuName } = await importNlcDistModule<{
    getPrettyBuildGpuName: (gpu: LlamaGpu | false) => string
  }>("bindings", "consts.js")
  const { getPlatform } = await importNlcDistModule<{
    getPlatform: () => string
  }>("bindings", "utils", "getPlatform.js")

  const platform = getPlatform()
  const layers = await detectAvailableComputeLayers({ platform })
  const inspectLines: string[] = []

  if (layers.cuda.hasNvidiaDriver && !layers.cuda.hasCudaRuntime) {
    inspectLines.push("已检测到 NVIDIA 驱动，未检测到 CUDA 运行时")
    inspectLines.push("安装 CUDA Toolkit 后可使用 CUDA 加速（见 node-llama-cpp CUDA 指南）")
  } else if (layers.cuda.hasCudaRuntime && !layers.cuda.hasNvidiaDriver) {
    inspectLines.push("已检测到 CUDA 运行时，未检测到 NVIDIA 驱动")
  }
  if (layers.vulkan) inspectLines.push("Vulkan：系统支持")
  if (layers.cuda.hasNvidiaDriver && layers.cuda.hasCudaRuntime) {
    inspectLines.push("CUDA：驱动与运行时均已就绪")
  }

  let gpuLabel = "未启用 GPU 加速"
  let vramSummary = "当前为 CPU 推理"
  let vramUsedPercent = 0
  let autoGpu: LlamaGpu | false | null = null

  const llama = await tryProductionLlama()
  if (llama) {
    try {
      autoGpu = llama.gpu
      const pretty =
        llama.gpu === false
          ? "CPU"
          : getPrettyBuildGpuName(llama.gpu)
      inspectLines.push(`推理后端（getLlama 自动）: ${pretty}`)

      if (llama.gpu !== false) {
        const vram = await llama.getVramState()
        const deviceNames = await llama.getGpuDeviceNames().catch(() => [] as string[])
        if (vram.total > 0) {
          vramUsedPercent =
            Math.floor((vram.used / vram.total) * 10000) / 100
          vramSummary = `${vramUsedPercent}%（${formatVramBytes(vram.used)}/${formatVramBytes(vram.total)}）`
          gpuLabel =
            deviceNames.length > 0 ? deviceNames[0]! : pretty
          if (deviceNames.length > 0) {
            inspectLines.push(`设备：${deviceNames.join("、")}`)
          }
          inspectLines.push(`VRAM：${vramSummary}`)
        }
      }
    } finally {
      await llama.dispose().catch(() => {})
    }
  }

  if (llama == null || autoGpu === false) {
    inspectLines.push(
      "未加载 GPU 后端；若已安装 CUDA/Vulkan 预编译包，可执行 bun run electron:rebuild"
    )
  }

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const ramPct = totalMem > 0 ? Math.floor((usedMem / totalMem) * 100) : 0
  inspectLines.push(
    `内存：${ramPct}%（${formatVramBytes(usedMem)}/${formatVramBytes(totalMem)}）`
  )

  return { gpuLabel, vramSummary, vramUsedPercent, inspectLines }
}
