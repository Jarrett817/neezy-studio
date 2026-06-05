import {
  loadEmbeddingModel as loadEmbeddingInMain,
} from "~/services/electron-client"
import { isElectronLlmAvailable } from "~/services/llm"

/** 应用启动时预加载内置 Embedding（node-llama-cpp） */
export async function bootstrapRuntimeModels(): Promise<void> {
  if (!isElectronLlmAvailable()) return
  await loadEmbeddingInMain().catch((error) =>
    console.warn("[LLM] 内置 Embedding 预加载失败:", error)
  )
}
