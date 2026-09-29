import { EditorContent, useEditor } from "@tiptap/react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { toast } from "sonner"

import type { Editor } from "@tiptap/core"
import type { JSONContent } from "@tiptap/react"

import { cn } from "~/lib/utils"
import { tiptapExtensions } from "~/lib/tiptap-extensions"
import { compressImageToDataUrl, isTiptapEmpty } from "~/services/chat-content"

/** 命令式句柄：父组件通过 ref 取内容/清空，避免每次按键都 setState 触发页面重渲染 */
export type ChatEditorHandle = {
  getText: () => string
  getJSON: () => JSONContent | null
  clear: () => void
  focus: () => void
}

export type SkillSlashItem = { name: string; description: string }

export type ChatEditorProps = {
  placeholder?: string
  disabled?: boolean
  onSubmit?: () => void
  /** 仅在"空 ↔ 非空"切换时触发，用于发送按钮启用态，而非每次按键 */
  onEmptyChange?: (empty: boolean) => void
  skills?: SkillSlashItem[]
  className?: string
}

type SlashState = { query: string; index: number } | null

function matchSkillSlash(skills: SkillSlashItem[], query: string): SkillSlashItem[] {
  const q = query.toLowerCase().replace(/^skill:/, "")
  return skills
    .filter((skill) => {
      if (!q) return true
      return [skill.name, skill.description].some((field) => field.toLowerCase().includes(q))
    })
    .slice(0, 8)
}

export const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(function ChatEditor(
  { placeholder = "输入消息…", disabled, onSubmit, onEmptyChange, skills = [], className },
  ref
) {
  const editorRef = useRef<Editor | null>(null)
  const wasEmptyRef = useRef(true)
  const onSubmitRef = useRef(onSubmit)
  const onEmptyChangeRef = useRef(onEmptyChange)
  const skillsRef = useRef(skills)
  const slashRef = useRef<SlashState>(null)
  const [slash, setSlash] = useState<SlashState>(null)
  skillsRef.current = skills
  slashRef.current = slash
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])
  useEffect(() => { onEmptyChangeRef.current = onEmptyChange }, [onEmptyChange])

  const setSlashState = useCallback((next: SlashState) => {
    slashRef.current = next
    setSlash(next)
  }, [])

  const applySkill = useCallback((skill: SkillSlashItem) => {
    const ed = editorRef.current
    if (!ed) return
    ed.chain()
      .focus()
      .setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `/skill:${skill.name} ` }],
          },
        ],
      })
      .run()
    wasEmptyRef.current = false
    onEmptyChangeRef.current?.(false)
    setSlashState(null)
  }, [setSlashState])

  const insertImage = useCallback(async (file: File) => {
    const ed = editorRef.current
    if (!ed) return
    if (file.size > 20 * 1024 * 1024) {
      toast.error("图片过大（>20MB）")
      return
    }
    try {
      const dataUrl = await compressImageToDataUrl(file)
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
      const empty = isTiptapEmpty(ed.getJSON())
      if (empty !== wasEmptyRef.current) {
        wasEmptyRef.current = empty
        onEmptyChangeRef.current?.(empty)
      }
      const text = ed.getText().trim()
      if (text.startsWith("/") && !text.slice(1).includes(" ") && !text.includes("\n")) {
        const query = text.slice(1)
        const prev = slashRef.current
        if (!prev || prev.query !== query) setSlashState({ query, index: 0 })
      } else if (slashRef.current) {
        setSlashState(null)
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
        const current = slashRef.current
        const matches = current ? matchSkillSlash(skillsRef.current, current.query) : []
        if (current && matches.length > 0) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            const delta = event.key === "ArrowDown" ? 1 : -1
            const index = (current.index + delta + matches.length) % matches.length
            setSlashState({ query: current.query, index })
            return true
          }
          if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
            event.preventDefault()
            const skill = matches[current.index] ?? matches[0]
            if (skill) applySkill(skill)
            return true
          }
        }
        if (event.key === "Escape" && current) {
          setSlashState(null)
          return true
        }
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
      getJSON: () => editorRef.current?.getJSON() ?? null,
      clear: () => {
        editorRef.current?.commands.clearContent()
        wasEmptyRef.current = true
        onEmptyChangeRef.current?.(true)
      },
      focus: () => editorRef.current?.commands.focus(),
    }),
    []
  )

  useEffect(() => {
    if (!editor) return
    if (disabled && editor.isEditable) editor.setEditable(false)
    if (!disabled && !editor.isEditable) editor.setEditable(true)
  }, [editor, disabled])

  useEffect(() => () => editor?.destroy(), [editor])

  if (!editor) {
    return <div className={cn("rounded-xl min-h-[56px]", className)} />
  }

  const slashMatches = slash ? matchSkillSlash(skills, slash.query) : []

  return (
    <div className={cn("relative rounded-xl", className)}>
      {slash && slashMatches.length > 0 ? (
        <ul className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1 shadow-lg">
          {slashMatches.map((skill, index) => (
            <li key={skill.name}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left",
                  index === slash.index ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setSlashState({ query: slash.query, index })}
                onClick={() => applySkill(skill)}
              >
                <span className="font-mono text-xs">/skill:{skill.name}</span>
                {skill.description ? (
                  <span className="line-clamp-1 w-full text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  )
})
