import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"

/**
 * 共享 Tiptap 扩展集合。
 * 不包含 mention（chat 用 mention @ skill 的方案后续单独加）。
 */
export const tiptapExtensions = (placeholder: string) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: { HTMLAttributes: { class: "rounded-lg bg-muted/60 p-3 font-mono text-xs" } },
  }),
  Image.configure({
    inline: false,
    allowBase64: true,
    HTMLAttributes: { class: "max-w-full rounded-lg" },
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { class: "text-primary underline underline-offset-2" },
  }),
  Placeholder.configure({ placeholder }),
]
