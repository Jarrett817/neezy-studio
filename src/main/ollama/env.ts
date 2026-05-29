let configuredOllamaHost: string | null = null

export function configureOllamaHost(host: string): void {
  const trimmed = host.trim().replace(/\/$/, "")
  configuredOllamaHost = trimmed || null
  if (configuredOllamaHost) {
    process.env.OLLAMA_HOST = configuredOllamaHost
  }
}

export function getConfiguredOllamaHost(): string | null {
  return configuredOllamaHost
}

/** 启动 ollama serve 时环境变量（不设置 OLLAMA_MODELS，由 Ollama 自身/系统默认目录管理） */
export function buildOllamaProcessEnv(): NodeJS.ProcessEnv {
  return { ...process.env }
}
