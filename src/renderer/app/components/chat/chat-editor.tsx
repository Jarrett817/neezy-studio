import { EditorContent, useEditor } from "@tiptap/react"
import { ImagePlus, LinkIcon } from "lucide-react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react"
import { toast } from "sonner"

import type { Editor } from "@tiptap/core"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { tiptapExtensions } from "~/lib/tiptap-extensions"
import { fileToBase64DataUrl } from "~/services/chat-content"

/** 命令式句柄：父组件通过 ref 取内容/清空，避免每次按键都 setState 触发页面重渲染 */
export type ChatEditorHandle = {
  getText: () => string
  clear: () => void
  focus: () => void
}

export type ChatEditorProps = {
  placeholder?: string
  disabled?: boolean
  onSubmit?: () => void
  /** 仅在"空 ↔ 非空"切换时触发，用于发送按钮启用态，而非每次按键 */
  onEmptyChange?: (empty: boolean) => void
  className?: string
}

export const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(function ChatEditor(
  { placeholder = "输入消息…", disabled, onSubmit, onEmptyChange, className },
  ref
) {
  const editorRef = useRef<Editor | null>(null)
  const wasEmptyRef = useRef(true)
  const onSubmitRef = useRef(onSubmit)
  const onEmptyChangeRef = useRef(onEmptyChange)
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])
  useEffect(() => { onEmptyChangeRef.current = onEmptyChange }, [onEmptyChange])

  const insertImage = useCallback(async (file: File) => {
    const ed = editorRef.current
    if (!ed) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error("图片过大（>8MB）")
      return
    }
    try {
      const dataUrl = await fileToBase64DataUrl(file)
      ed.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "读取图片失败")
    }
  }, [])

  const editor = useEditor({
    extensions: tiptapExtensions(placeholder),
    content: "",
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const empty = ed.isEmpty
      if (empty !== wasEmptyRef.current) {
        wasEmptyRef.current = empty
        onEmptyChangeRef.current?.(empty)
      }
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none px-5 py-4 focus:outline-none min-h-[56px]",
          "leading-relaxed text-[15px]",
          "[&_p]:my-0.5 [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:text-muted-foreground/40",
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:h-0",
          "[&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-border/40",
          "[&_a]:text-primary [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/30",
          "[&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        ),
      },
      handlePaste(_, event) {
        const items = Array.from(event.clipboardData?.items ?? [])
        const image = items.find((it) => it.type.startsWith("image/"))
        if (!image) return false
        const file = image.getAsFile()
        if (!file) return false
        event.preventDefault()
        insertImage(file)
        return true
      },
      handleDrop(_, event, _slice, moved) {
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files ?? [])
        const image = files.find((f) => f.type.startsWith("image/"))
        if (!image) return false
        event.preventDefault()
        insertImage(image)
        return true
      },
      handleKeyDown(_, event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          if (onSubmitRef.current) {
            event.preventDefault()
            onSubmitRef.current()
            return true
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useImperativeHandle(
    ref,
    () => ({
      getText: () => editorRef.current?.getText().trim() ?? "",
      clear: () => {
        editorRef.current?.commands.clearContent()
        wasEmptyRef.current = true
      },
      focus: () => editorRef.current?.commands.focus(),
    }),
    []
  )

  const pickImage = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) insertImage(file)
    }
    input.click()
  }, [insertImage])

  const setLink = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const prev = ed.getAttributes("link").href as string | undefined
    const url = window.prompt("链接地址（留空移除）", prev ?? "https://")
    if (url === null) return
    if (url === "") {
      ed.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [])

  useEffect(() => {
    if (!editor) return
    if (disabled && editor.isEditable) editor.setEditable(false)
    if (!disabled && !editor.isEditable) editor.setEditable(true)
  }, [editor, disabled])

  useEffect(() => () => editor?.destroy(), [editor])

  if (!editor) {
    return <div className={cn("rounded-xl min-h-[56px]", className)} />
  }

  return (
    <div className={cn("overflow-hidden rounded-xl", className)}>
      <EditorContent editor={editor} />
      <div className="flex items-center gap-1 px-3 pb-1.5">
        <ActionButton label="插入图片" onClick={pickImage}>
          <ImagePlus className="size-3.5" />
        </ActionButton>
        <ActionButton label="插入链接" onClick={setLink} active={editor.isActive("link")}>
          <LinkIcon className="size-3.5" />
        </ActionButton>
      </div>
    </div>
  )
})

function ActionButton({
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
      className={cn("size-7 rounded-lg text-muted-foreground/50 hover:text-foreground", active && "text-primary")}
    >
      {children}
    </Button>
  )
}
