/** pi-ai 对话 API 路由：OpenAI 兼容 vs Anthropic Messages */

export type ChatApiKind = "openai-completions" | "anthropic-messages"

export function inferChatApiKind(resolvedBaseUrl: string): ChatApiKind {
  const base = resolvedBaseUrl.trim().replace(/\/$/, "")
  if (!base) return "openai-completions"
  if (/\/anthropic(?:\/|$)/i.test(base) || /\/apps\/anthropic$/i.test(base)) {
    return "anthropic-messages"
  }
  // MiniMax Coding Plan 国内域名为 Anthropic Messages；仅显式 /v1 时走 OpenAI
  if (/api\.minimaxi\.com|api\.minimax\.cn/i.test(base) && !/\/v\d+$/i.test(base)) {
    return "anthropic-messages"
  }
  return "openai-completions"
}

export function resolveChatApiBaseUrl(resolvedBaseUrl: string, apiKind: ChatApiKind): string {
  const base = resolvedBaseUrl.trim().replace(/\/$/, "")
  if (!base) return base
  if (apiKind === "anthropic-messages") {
    if (/api\.minimaxi\.com|api\.minimax\.cn/i.test(base) && !/\/anthropic/i.test(base)) {
      return `${base}/anthropic`
    }
    return base
  }
  if (/\/v\d+$/i.test(base)) return base
  return `${base}/v1`
}

/** pi-ai KnownProvider；preset 与 baseUrl 共同推断（custom 填 MiniMax Anthropic 地址时仍走 minimax-cn） */
export function resolvePiProvider(
  preset: string,
  apiKind: ChatApiKind,
  resolvedBaseUrl = ""
): string {
  const base = resolvedBaseUrl.trim().toLowerCase()

  if (apiKind === "anthropic-messages") {
    if (preset === "minimax-coding" || /minimaxi\.com|minimax\.cn/.test(base)) {
      return "minimax-cn"
    }
    if (/minimax\.io/.test(base) && !base.includes("minimaxi.com")) {
      return "minimax"
    }
    if (preset === "mimo-coding" || /xiaomimimo\.com/.test(base)) {
      return "xiaomi-token-plan-cn"
    }
    if (preset === "aliyun-coding" || /maas\.aliyuncs\.com/.test(base)) {
      return "anthropic"
    }
    if (preset === "tencent-coding" || /lkeap\.cloud\.tencent\.com/.test(base)) {
      return "anthropic"
    }
    if (preset === "deepseek-coding" || /deepseek\.com/.test(base)) {
      return "deepseek"
    }
  }

  if (preset === "custom" || !preset) return "openai-compatible"
  return preset
}
