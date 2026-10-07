import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands"
import { json } from "@codemirror/lang-json"
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useEffect, useRef } from "react"
import { cn } from "~/lib/utils"

export interface JsonCodeEditorProps {
  value: string
  onChange?: (value: string) => void
  className?: string
  editable?: boolean
  minHeight?: string
}

export function JsonCodeEditor({
  value,
  onChange,
  className,
  editable = true,
  minHeight = "300px",
}: JsonCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange?.(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        json(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        updateListener,
        editable ? EditorView.editable.of(true) : EditorView.editable.of(false),
        EditorView.theme({
          "&": {
            height: "100%",
            minHeight,
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "13px",
            lineHeight: "1.6",
          },
          ".cm-gutters": {
            borderRight: "1px solid rgba(255,255,255,0.06)",
          },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, minHeight, editable])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === valueRef.current) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: valueRef.current },
    })
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-[#282c34]",
        className
      )}
    />
  )
}
