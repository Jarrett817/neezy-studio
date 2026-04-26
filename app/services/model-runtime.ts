import { invoke } from "@tauri-apps/api/core"

export type LocalModelOption = {
  id: string
  ollamaModel: string
  name: string
  sizeLabel: string
  minMemoryLabel: string
  quantization: string
  summary: string
  downloaded: boolean
  provider: "ollama" | "missing"
}

export type ModelRuntimeState = {
  activeModelId: string | null
  allowAutoDownload: boolean
  ollamaAvailable: boolean
  ollamaInstallUrl: string
  models: LocalModelOption[]
}

export async function getModelRuntimeState(): Promise<ModelRuntimeState> {
  return invoke<ModelRuntimeState>("get_model_runtime_state")
}

export async function downloadModel(
  modelId: string
): Promise<ModelRuntimeState> {
  return invoke<ModelRuntimeState>("download_model", { modelId })
}

export async function setActiveModel(
  modelId: string
): Promise<ModelRuntimeState> {
  return invoke<ModelRuntimeState>("set_active_model", { modelId })
}

export async function installOllama(): Promise<string> {
  return invoke<string>("install_ollama")
}
