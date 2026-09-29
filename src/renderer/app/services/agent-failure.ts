export function enrichAgentFailureMessage(message: string): string {
  if (message !== "Connection error." && !message.startsWith("Connection error")) {
    return message
  }
  return `${message} HTTPS 连接失败（OpenAI SDK 网络层，不是 401/400）。请检查 Base URL 与 Key 地域是否一致（国内 dashscope.aliyuncs.com / 国际 dashscope-intl.aliyuncs.com）、代理与 SSL 证书；可在「模型与连接」点「从接口拉取」复现。`
}

export function extractAgentFailure(
  message: { stopReason?: string; errorMessage?: string } | undefined
): string | null {
  if (!message) return null
  if (message.stopReason === "error" || message.errorMessage) {
    const raw = message.errorMessage?.trim() || "模型调用失败"
    return enrichAgentFailureMessage(raw)
  }
  return null
}
