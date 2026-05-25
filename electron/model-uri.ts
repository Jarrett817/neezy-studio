import type { ModelDefinition } from "./types"

/** node-llama-cpp 模型 URI（HF 或本机路径） */
export function getModelUri(model: ModelDefinition): string {
  return model.modelUri
}
