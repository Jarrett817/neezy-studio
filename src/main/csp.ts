import type { App } from "electron"
import { session } from "electron"

/**
 * 生产环境 CSP。dev 模式不限制（vite HMR / sourcemap 需要宽松环境）。
 *
 * - connect-src 放开 https（远程模型 API）+ localhost（本地 Ollama / vite ws）
 * - style-src 'unsafe-inline'：shadcn/radix/tailwind 运行时注入内联样式
 * - img-src data:/blob:：base64 图片、本地文件预览
 */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https: http://localhost:* ws://localhost:*",
].join("; ")

/** 安装 Content-Security-Policy 响应头注入。仅在打包后生效。 */
export function installCsp(app: App): void {
  if (!app.isPackaged) return

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [PROD_CSP],
      },
    })
  })
}
