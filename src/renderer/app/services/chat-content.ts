import type { JSONContent } from "@tiptap/react"

import type { ImageContent } from "../../../shared/pi-sdk"

/** 传给 LLM 的图片 MIME 白名单（压缩库常见输出 + 粘贴常见类型） */
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

/**
 * 把 Tiptap JSON 文档拍平为纯文本（保留段落换行，去除所有标记）。
 * 用于把富文本消息序列化给 LLM。
 */
export function tiptapToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return ""
  const out: string[] = []
  const visit = (node: JSONContent) => {
    if (node.type === "text") {
      out.push(node.text ?? "")
      return
    }
    if (node.type === "image" || node.type === "hardBreak") {
      out.push(" ")
      return
    }
    const blockLike = [
      "paragraph",
      "heading",
      "codeBlock",
      "blockquote",
      "bulletList",
      "orderedList",
      "listItem",
      "horizontalRule",
    ]
    for (const child of node.content ?? []) {
      visit(child)
    }
    if (blockLike.includes(node.type ?? "")) {
      out.push("\n")
    }
  }
  visit(doc)
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * 从文件生成 base64 data URL（用于在 Tiptap JSON 中嵌入图片）。
 * 仅在 chat 端使用（不依赖主进程 IPC）。
 */
export function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"))
    reader.readAsDataURL(file)
  })
}

/**
 * 压缩图片后生成 base64 data URL。多模态传给大模型前先压，避免体积过大。
 * 默认：最长边 1568px（主流视觉模型的经济分辨率）、目标 ≤1MB、Web Worker 异步。
 * 压缩失败时回退为原图。
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const { default: imageCompression } = await import(
    "browser-image-compression"
  )
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1568,
      useWebWorker: true,
      initialQuality: 0.8,
    })
    return fileToBase64DataUrl(compressed)
  } catch {
    return fileToBase64DataUrl(file)
  }
}

/**
 * 从 Tiptap JSON 中提取所有图片节点（用于多模态分发）。
 */
export function extractImagesFromTiptap(
  doc: JSONContent | null | undefined
): Array<{ src: string; alt?: string }> {
  const result: Array<{ src: string; alt?: string }> = []
  if (!doc) return result
  const visit = (node: JSONContent) => {
    if (node.type === "image" && node.attrs?.src) {
      result.push({
        src: String(node.attrs.src),
        alt: node.attrs.alt ?? undefined,
      })
    }
    for (const child of node.content ?? []) visit(child)
  }
  visit(doc)
  return result
}

/**
 * data URL → Pi ImageContent（纯 base64 + mimeType）。非法格式返回 null。
 */
export function dataUrlToImageContent(src: string): ImageContent | null {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src.trim())
  if (!m) return null
  let mimeType = m[1].trim().toLowerCase()
  if (mimeType === "image/jpg") mimeType = "image/jpeg"
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) return null
  const data = m[2].replace(/\s+/g, "")
  if (!data) return null
  return { type: "image", data, mimeType }
}

/** 从 Tiptap JSON 提取可提交给 Agent 的 ImageContent[]（跳过非法 src） */
export function extractImageContentsFromTiptap(
  doc: JSONContent | null | undefined
): ImageContent[] {
  const out: ImageContent[] = []
  for (const { src } of extractImagesFromTiptap(doc)) {
    const img = dataUrlToImageContent(src)
    if (img) out.push(img)
  }
  return out
}

/**
 * 空文档判断（用于判断是否允许发送空内容）。
 */
export function isTiptapEmpty(doc: JSONContent | null | undefined): boolean {
  if (!doc) return true
  if (doc.type !== "doc") return false
  const text = tiptapToPlainText(doc)
  const hasImage = extractImagesFromTiptap(doc).length > 0
  return text.length === 0 && !hasImage
}
