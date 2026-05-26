/** 是否应开启 Ollama 原生 think 流（message.thinking） */
export function modelSupportsNativeThink(modelName: string | null | undefined): boolean {
  if (!modelName) return false
  const n = modelName.toLowerCase()
  return (
    n.includes("deepseek-r1") ||
    n.includes("r1-distill") ||
    n.includes("qwen3") ||
    n.includes("thinking") ||
    n.includes("gpt-oss") ||
    n.includes("kimi-k2-thinking")
  )
}
