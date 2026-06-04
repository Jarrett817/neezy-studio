import { generateHTML, type JSONContent } from "@tiptap/html"
import { useMemo } from "react"

import { tiptapExtensions } from "~/lib/tiptap-extensions"
import { cn } from "~/lib/utils"

const RENDER_EXTENSIONS = tiptapExtensions("")

export function TiptapContent({
  doc,
  className,
}: {
  doc: JSONContent | null | undefined
  className?: string
}) {
  const html = useMemo(() => {
    if (!doc) return ""
    try {
      return generateHTML(doc, RENDER_EXTENSIONS)
    } catch {
      return ""
    }
  }, [doc])

  if (!html) return null

  return (
    <div
      className={cn(
        "tiptap-prose prose prose-sm dark:prose-invert max-w-none",
        "leading-relaxed",
        "[&_p]:my-1 [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1",
        "[&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
