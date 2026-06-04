import type { JSONContent } from "@tiptap/react"

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
  return out.join("").replace(/\n{3,}/g, "\n\n").trim()
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
 * 从 Tiptap JSON 中提取所有图片节点（用于多模态分发）。
 */
export function extractImagesFromTiptap(
  doc: JSONContent | null | undefined
): Array<{ src: string; alt?: string }> {
  const result: Array<{ src: string; alt?: string }> = []
  if (!doc) return result
  const visit = (node: JSONContent) => {
    if (node.type === "image" && node.attrs?.src) {
      result.push({ src: String(node.attrs.src), alt: node.attrs.alt ?? undefined })
    }
    for (const child of node.content ?? []) visit(child)
  }
  visit(doc)
  return result
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
