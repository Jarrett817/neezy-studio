import { EditorContent, useEditor, type JSONContent } from "@tiptap/react"
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { tiptapExtensions } from "~/lib/tiptap-extensions"
import { fileToBase64DataUrl } from "~/services/chat-content"

export type TiptapEditorProps = {
  value: JSONContent | null
  onChange: (doc: JSONContent) => void
  placeholder?: string
  minHeightClass?: string
  disabled?: boolean
  showToolbar?: boolean
  onImageInsert?: (dataUrl: string, file: File) => void
  onSubmit?: () => void
  className?: string
  contentClassName?: string
}

const DEFAULT_PLACEHOLDER = "输入消息，回车发送，Shift+Enter 换行…"

export function TiptapEditor({
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
  minHeightClass = "min-h-[88px]",
  disabled,
  showToolbar = true,
  onImageInsert,
  onSubmit,
  className,
  contentClassName,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: tiptapExtensions(placeholder),
    content: value ?? "",
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none px-4 py-3 focus:outline-none",
          "leading-relaxed text-sm",
          "[&_p]:my-1 [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:mt-1.5 [&_h3]:mb-1",
          "[&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg",
          "[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:h-0",
          contentClassName
        ),
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? [])
        const imageItem = items.find((it) => it.type.startsWith("image/"))
        if (!imageItem) return false
        const file = imageItem.getAsFile()
        if (!file) return false
        event.preventDefault()
        void insertImageFromFile(file)
        return true
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files ?? [])
        const image = files.find((f) => f.type.startsWith("image/"))
        if (!image) return false
        event.preventDefault()
        void insertImageFromFile(image)
        return true
      },
      handleKeyDown(_view, event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          if (onSubmit) {
            event.preventDefault()
            onSubmit()
            return true
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (disabled && editor.isEditable) editor.setEditable(false)
    if (!disabled && !editor.isEditable) editor.setEditable(true)
  }, [editor, disabled])

  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  const insertImageFromFile = async (file: File) => {
    if (!editor) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error("图片过大（>8MB）")
      return
    }
    try {
      const dataUrl = await fileToBase64DataUrl(file)
      editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
      onImageInsert?.(dataUrl, file)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "读取图片失败"
      toast.error(msg)
    }
  }

  const pickImage = () => {
    if (!editor) return
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void insertImageFromFile(file)
    }
    input.click()
  }

  const setLink = () => {
    if (!editor) return
    const previous = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("链接地址（留空移除）", previous ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border/40 bg-card",
          minHeightClass,
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 bg-card",
        className
      )}
    >
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/20 px-2 py-1.5">
          <ToolbarButton label="加粗" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
            <Bold className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="斜体" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
            <Italic className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="删除线" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
            <Strikethrough className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="行内代码" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
            <Code className="size-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton label="一级标题" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}>
            <Heading1 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="二级标题" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
            <Heading2 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="无序列表" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
            <List className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="有序列表" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
            <ListOrdered className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="引用" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
            <Quote className="size-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton label="链接" onClick={setLink} active={editor.isActive("link")}>
            <LinkIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="插入图片" onClick={pickImage}>
            <ImagePlus className="size-3.5" />
          </ToolbarButton>
        </div>
      ) : null}
      <EditorContent editor={editor} className={cn(minHeightClass, "max-h-80 overflow-y-auto")} />
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "size-7 rounded-md text-muted-foreground",
        active && "bg-primary/10 text-primary"
      )}
    >
      {children}
    </Button>
  )
}
