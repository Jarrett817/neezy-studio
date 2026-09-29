import type { ImageContent } from "@earendil-works/pi-ai"

/** 把 Error（含 cause）格式化为可展示字符串。 */
export function formatPromptError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (
    cause instanceof Error &&
    cause.message &&
    cause.message !== error.message
  ) {
    return `${error.message} (${cause.message})`
  }
  return error.message
}

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

/** IPC 入参校验：只放行合法 ImageContent，非法项丢弃；全非法则视为无图。 */
export function sanitizePromptImages(
  images: unknown
): ImageContent[] | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined
  const out: ImageContent[] = []
  for (const item of images) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    if (rec.type !== "image") continue
    if (typeof rec.data !== "string" || !rec.data) continue
    if (typeof rec.mimeType !== "string") continue
    let mimeType = rec.mimeType.trim().toLowerCase()
    if (mimeType === "image/jpg") mimeType = "image/jpeg"
    if (!ALLOWED_IMAGE_MIME.has(mimeType)) continue
    // 拒绝仍带 data URL 前缀或非 base64 字符的载荷
    if (rec.data.startsWith("data:") || rec.data.includes(",")) continue
    if (!/^[A-Za-z0-9+/=\s]+$/.test(rec.data)) continue
    out.push({ type: "image", data: rec.data.replace(/\s+/g, ""), mimeType })
  }
  return out.length > 0 ? out : undefined
}
