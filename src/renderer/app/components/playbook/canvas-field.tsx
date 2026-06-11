import { useCallback, useRef, useState } from "react"
import { Label } from "~/components/ui/label"

/**
 * 白板字段 — 使用 @excalidraw/excalidraw。
 * 值是 Excalidraw 的 elements JSON 数组。
 * 序列化时提取所有文字元素的 text 内容供纯文本模型理解，
 * 多模态模型可通过 exportToBlob 获取 PNG。
 */

// 懒加载 Excalidraw 避免阻塞首屏
let ExcalidrawComponent: React.ComponentType<any> | null = null
let loadPromise: Promise<void> | null = null

function loadExcalidraw(): Promise<void> {
  if (ExcalidrawComponent) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = Promise.all([
    import("@excalidraw/excalidraw"),
    import("@excalidraw/excalidraw/index.css"),
  ]).then(([mod]) => {
    ExcalidrawComponent = mod.Excalidraw
  })
  return loadPromise
}

export interface CanvasValue {
  elements: unknown[]
  appState?: Record<string, unknown>
}

function normalize(value: unknown): CanvasValue {
  if (value && typeof value === "object" && "elements" in value) {
    return value as CanvasValue
  }
  return { elements: [] }
}

/** 从 Excalidraw elements 中提取所有文字内容，供纯文本模型使用 */
export function extractCanvasText(value: unknown): string {
  const canvas = normalize(value)
  const texts: string[] = []
  for (const el of canvas.elements) {
    if (el && typeof el === "object" && "type" in el) {
      const element = el as { type: string; text?: string; originalText?: string }
      if (element.type === "text" && (element.text || element.originalText)) {
        texts.push(element.originalText || element.text || "")
      }
    }
  }
  return texts.join("\n")
}

type CanvasFieldProps = {
  value: unknown
  disabled?: boolean
  onChange: (value: CanvasValue) => void
}

export function CanvasField({ value, disabled, onChange }: CanvasFieldProps) {
  const [loaded, setLoaded] = useState(Boolean(ExcalidrawComponent))
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialRef = useRef(normalize(value))

  // 触发懒加载
  if (!loaded) {
    loadExcalidraw().then(() => setLoaded(true))
  }

  const handleChange = useCallback((elements: unknown[], appState: Record<string, unknown>) => {
    onChangeRef.current({ elements, appState })
  }, [])

  if (!loaded || !ExcalidrawComponent) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-xl border border-border/60 bg-muted/10 text-sm text-muted-foreground">
        加载白板组件…
      </div>
    )
  }

  const Excalidraw = ExcalidrawComponent

  return (
    <div className="h-96 w-full overflow-hidden rounded-xl border border-border/60" style={{ position: "relative" }}>
      <Excalidraw
        initialData={{
          elements: initialRef.current.elements,
          appState: {
            viewBackgroundColor: "#fafafa",
            ...(initialRef.current.appState ?? {}),
          },
        }}
        onChange={handleChange}
        viewModeEnabled={disabled}
        langCode="zh-CN"
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  )
}

export function CanvasFieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label>
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
      <span className="ml-2 text-xs font-normal text-muted-foreground">
        自由绘画 · 添加文字和形状 · 内容将发送给 AI
      </span>
    </Label>
  )
}
