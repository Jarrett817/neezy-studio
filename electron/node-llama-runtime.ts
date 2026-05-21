import type { Llama } from "node-llama-cpp"

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

export function getLlamaGpuOptions(preferLowPower: boolean) {
  if (preferLowPower) return { gpu: false as const }
  if (process.platform === "win32") {
    return { gpu: { type: "auto" as const, exclude: ["vulkan" as const] } }
  }
  return { gpu: "auto" as const }
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
    llamaInstance = await getLlama(getLlamaGpuOptions(preferLowPower))
    llamaMode = mode
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
