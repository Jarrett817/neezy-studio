/** 本应用为 Ollama 配置的模型落盘目录（对应设置里的 modelsDir） */
let configuredModelsDir: string | null = null

export function configureOllamaStorage(modelsDir: string): void {
  configuredModelsDir = modelsDir
}

export function getConfiguredOllamaModelsDir(): string | null {
  return configuredModelsDir
}

/** 启动 ollama serve 时注入的环境变量 */
export function buildOllamaProcessEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (configuredModelsDir) {
    env.OLLAMA_MODELS = configuredModelsDir
  }
  return env
}
