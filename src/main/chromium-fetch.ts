import path from "node:path"
import { app, net } from "electron"

/**
 * tools-manager 在模块加载时固化 getBinDir()；须在任何 pi-coding-agent import 之前设好。
 * 本文件是 main 入口第一个 import。
 */
process.env.PI_CODING_AGENT_DIR ??= path.join(
  app.getPath("userData"),
  "pi-agent"
)

const nodeFetch = globalThis.fetch.bind(globalThis)

/** Pi 管理下载（rg/fd）依赖 Node fetch 的 redirect:manual / Readable.fromWeb；net.fetch 会失败。 */
function useNodeFetch(input: RequestInfo | URL): boolean {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : typeof input === "object" && input && "url" in input
          ? String((input as Request).url)
          : ""
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return (
      host === "github.com" ||
      host === "api.github.com" ||
      host === "objects.githubusercontent.com" ||
      host.endsWith(".githubusercontent.com")
    )
  } catch {
    return false
  }
}

/**
 * 默认仍走 Chromium net.fetch（系统 CA，解决 dashscope 等证书链问题）；
 * GitHub 资源下载保留 Node fetch。
 */
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (useNodeFetch(input)) return nodeFetch(input, init)
  const request =
    input instanceof URL ? input.href : (input as string | Request)
  return net.fetch(request, init)
}) as typeof fetch
