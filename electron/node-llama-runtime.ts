import type { Llama } from "node-llama-cpp"

import { getGpuRuntimeDisplay } from "./gpu-inspect"

type LlamaModule = typeof import("node-llama-cpp")

/** node-llama-cpp 为 ESM（含 TLA）；CJS 产物中须保留运行时 import()，避免 tsc  lowering 成 require */
const esmImport = <T>(specifier: string): Promise<T> =>
  new Function("s", "return import(s)")(specifier) as Promise<T>

let llamaModule: LlamaModule | null = null
let llamaInstance: Llama | null = null
let llamaMode: "cpu" | "gpu" | null = null

export async function getLlamaModule(): Promise<LlamaModule> {
  if (!llamaModule) {
    llamaModule = await esmImport<LlamaModule>("node-llama-cpp")
  }
  return llamaModule
}

export async function acquireLlama(preferLowPower = false): Promise<Llama> {
  const mode = preferLowPower ? "cpu" : "gpu"
  if (llamaInstance && llamaMode !== mode) {
    await llamaInstance.dispose()
    llamaInstance = null
    llamaMode = null
  }
  if (!llamaInstance) {
    const { getLlama } = await getLlamaModule()
    // 官方建议：不指定 gpu 类型，由库检测并选用最佳后端（CUDA / Vulkan / Metal）
    llamaInstance = preferLowPower
      ? await getLlama({ gpu: false })
      : await getLlama()
    llamaMode = mode
    if (!preferLowPower) {
      console.info(`[llama] GPU type: ${String(llamaInstance.gpu)}`)
    }
  }
  return llamaInstance
}

export async function disposeLlamaInstance(): Promise<void> {
  if (llamaInstance) {
    await llamaInstance.dispose()
    llamaInstance = null
    llamaMode = null
  }
}

/** 与 CLI `inspect gpu` 同源探测，供模型页展示 */
export async function getLlamaGpuRuntimeInfo(): Promise<{
  gpuLabel: string
  vramUsedPercent: number
  vramSummary: string
  inspectLines: string[]
}> {
  return getGpuRuntimeDisplay()
}
