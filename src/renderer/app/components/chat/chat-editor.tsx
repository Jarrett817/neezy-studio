import { EditorContent, useEditor, Extension, type JSONContent } from "@tiptap/react"
import { ImagePlus, LinkIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Plugin, PluginKey } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"
import { toast } from "sonner"

import type { Editor } from "@tiptap/core"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { tiptapExtensions } from "~/lib/tiptap-extensions"
import { piComplete } from "~/services/pi-agent-client"
import { fileToBase64DataUrl } from "~/services/chat-content"

const GHOST_KEY = new PluginKey("ghost-completion")

function createGhostPlugin() {
  return Extension.create({
    name: "ghostCompletion",
    addProseMirrorPlugins() {
      return [new Plugin<{ text: string }>({
        key: GHOST_KEY,
        state: {
          init: () => ({ text: "" }),
          apply(tr, prev) {
            const meta = tr.getMeta(GHOST_KEY) as { text: string } | undefined
            if (meta) return meta
            if (tr.docChanged || tr.selectionSet) return { text: "" }
            return prev
          },
        },
        props: {
          decorations(state) {
            const ghost = GHOST_KEY.getState(state) as { text: string } | undefined
            if (!ghost?.text) return null
            const { from } = state.selection
            const deco = Decoration.widget(from, () => {
              const span = document.createElement("span")
              span.className = "ghost-completion"
              span.textContent = ghost.text
              span.style.color = "oklch(0.78 0.05 60 / 0.35)"
              span.style.pointerEvents = "none"
              span.style.userSelect = "none"
              return span
            })
            return DecorationSet.create(state.doc, [deco])
          },
        },
      })]
    },
  })
}

export type ChatEditorProps = {
  value: JSONContent | null
  onChange: (doc: JSONContent) => void
  placeholder?: string
  disabled?: boolean
  onSubmit?: () => void
  className?: string
}

export function ChatEditor({
  value,
  onChange,
  placeholder = "输入消息…",
  disabled,
  onSubmit,
  className,
}: ChatEditorProps) {
  const [ghost, setGhost] = useState("")
  const ghostRef = useRef("")
  const completingRef = useRef(false)
  const editorRef = useRef<Editor | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const triggerRef = useRef<() => void>(() => {})

  const requestGhost = useCallback(async () => {
    const ed = editorRef.current
    if (!ed || completingRef.current) return
    const textBefore = ed.state.doc.textBetween(0, ed.state.selection.from, "\n", " ").trim()
    if (!textBefore || textBefore.length < 2) return

    completingRef.current = true
    try {
      const result = await piComplete([
        { role: "system", content: "续写下文。只输出新增文字，不重复已有内容。不超过30字，不换行。" },
        { role: "user", content: textBefore },
      ], { maxTokens: 60 })
      const clean = result.trim().replace(/^["「『」』，,。.！!？?；;：:\s]+/g, "").trim()
      if (clean && editorRef.current) {
        const tr = editorRef.current.state.tr.setMeta(GHOST_KEY, { text: clean })
        editorRef.current.view.dispatch(tr)
      }
    } catch { /* silent */ }
    finally { completingRef.current = false }
  }, [])

  const scheduleGhost = useCallback(() => {
    clearTimeout(debounceRef.current)
    if (ghostRef.current || completingRef.current) return
    debounceRef.current = setTimeout(requestGhost, 3000)
  }, [requestGhost])

  useEffect(() => () => clearTimeout(debounceRef.current), [])
  useEffect(() => { triggerRef.current = requestGhost }, [requestGhost])

  const editor = useEditor({
    extensions: [
      ...tiptapExtensions(placeholder),
      createGhostPlugin(),
    ],
    content: value ?? "",
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON())
      scheduleGhost()
      const gs = GHOST_KEY.getState(ed.state) as { text: string } | undefined
      const t = gs?.text ?? ""
      if (t !== ghostRef.current) { ghostRef.current = t; setGhost(t) }
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const gs = GHOST_KEY.getState(ed.state) as { text: string } | undefined
      const t = gs?.text ?? ""
      if (t !== ghostRef.current) { ghostRef.current = t; setGhost(t) }
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none px-5 py-3.5 focus:outline-none min-h-[60px]",
          "leading-relaxed text-sm",
          "[&_p]:my-0.5 [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:text-muted-foreground/40",
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:h-0",
          "[&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border/40",
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
          if (onSubmit) { event.preventDefault(); onSubmit(); return true }
        }
        return false
      },
    },
  })

  useEffect(() => { editorRef.current = editor }, [editor])

  const acceptGhost = useCallback(() => {
    const ed = editorRef.current
    if (!ed || !ghostRef.current) return
    const text = ghostRef.current
    ed.view.dispatch(ed.state.tr.setMeta(GHOST_KEY, { text: "" }))
    ed.chain().focus().insertContent(text).run()
  }, [])
  // 全局 Tab 监听：直接绑 DOM 避免 Tiptap 闭包问题
  useEffect(() => {
    if (!editor) return
    let el: HTMLElement | undefined
    try { el = editor.view?.dom } catch { return }
    if (!el) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.isComposing) return
      if (ghostRef.current) { e.preventDefault(); acceptGhost() }
    }
    el.addEventListener("keydown", onKeyDown)
    return () => el.removeEventListener("keydown", onKeyDown)
  }, [editor])

  const insertImage = useCallback(async (file: File) => {
    const ed = editorRef.current
    if (!ed) return
    if (file.size > 8 * 1024 * 1024) { toast.error("图片过大（>8MB）"); return }
    try {
      const dataUrl = await fileToBase64DataUrl(file)
      ed.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "读取图片失败")
    }
  }, [])

  const pickImage = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
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
    if (url === "") { ed.chain().focus().extendMarkRange("link").unsetLink().run(); return }
    ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [])

  useEffect(() => {
    if (!editor) return
    if (disabled && editor.isEditable) editor.setEditable(false)
    if (!disabled && !editor.isEditable) editor.setEditable(true)
  }, [editor, disabled])

  useEffect(() => () => { editor?.destroy() }, [editor])

  if (!editor) return <div className={cn("rounded-xl border border-border/40 min-h-[60px]", className)} />

  return (
    <div className={cn("overflow-hidden rounded-xl", className)}>
      <div className="flex items-center gap-1 border-b border-border/20 px-3 py-1.5">
        <span className="text-xs text-muted-foreground/50">
          {ghost ? "Tab 接受补全 · Esc 忽略" : "Tab 触发 AI 补全"}
        </span>
        <span className="mx-2 h-3 w-px bg-border/60" />
        <ActionButton label="插入图片" onClick={pickImage}>
          <ImagePlus className="size-3.5" />
        </ActionButton>
        <ActionButton label="插入链接" onClick={setLink} active={editor.isActive("link")}>
          <LinkIcon className="size-3.5" />
        </ActionButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function ActionButton({
  label, active, onClick, children,
}: {
  label: string; active?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <Button
      type="button" variant="ghost" size="icon-xs"
      onClick={onClick} aria-label={label} title={label}
      className={cn("size-7 rounded-md text-muted-foreground/60 hover:text-foreground", active && "text-primary")}
    >
      {children}
    </Button>
  )
}