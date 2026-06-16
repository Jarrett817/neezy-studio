export type MindmapNode = {
  topic: string
  children?: MindmapNode[]
}

export type FlowNode = {
  id: string
  type?: string
  data?: { label?: string }
  position?: { x: number; y: number }
}

export type FlowEdge = {
  id: string
  source: string
  target: string
  label?: string
}

export type FlowchartValue = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export function mindmapToJson(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
}

export function flowchartToText(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const { nodes = [], edges = [] } = value as FlowchartValue
  if (nodes.length === 0) return ""

  const labelById = new Map(
    nodes.map((n) => [n.id, String(n.data?.label ?? n.id).trim()])
  )
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.source) ?? []
    list.push(e.target)
    out.set(e.source, list)
  }

  const targets = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => !targets.has(n.id))
  const start = roots[0]?.id ?? nodes[0]?.id
  if (!start) return ""

  const lines: string[] = []
  const seen = new Set<string>()
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return
    seen.add(id)
    lines.push(`${"  ".repeat(depth)}→ ${labelById.get(id) ?? id}`)
    for (const next of out.get(id) ?? []) walk(next, depth + 1)
  }
  walk(start, 0)
  return lines.join("\n")
}

export function defaultMindmapValue(): MindmapNode {
  return { topic: "中心主题", children: [] }
}

export function defaultFlowchartValue(): FlowchartValue {
  return {
    nodes: [
      { id: "1", data: { label: "开始" }, position: { x: 0, y: 0 } },
      { id: "2", data: { label: "步骤" }, position: { x: 180, y: 0 } },
    ],
    edges: [{ id: "e1-2", source: "1", target: "2" }],
  }
}

/** 从 Excalidraw canvas elements 中提取文字内容，序列化为文本 */
export function canvasToText(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const { elements = [] } = value as { elements?: unknown[] }
  const texts: string[] = []
  const shapes: string[] = []
  for (const el of elements) {
    if (!el || typeof el !== "object" || !("type" in el)) continue
    const element = el as { type: string; text?: string; originalText?: string; width?: number; height?: number }
    if (element.type === "text" && (element.text || element.originalText)) {
      texts.push(element.originalText || element.text || "")
    } else if (element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond") {
      shapes.push(element.type)
    }
  }
  const parts: string[] = []
  if (texts.length > 0) parts.push(`白板文字内容：\n${texts.join("\n")}`)
  if (shapes.length > 0) parts.push(`包含图形：${shapes.join("、")}`)
  return parts.join("\n\n") || "（白板为空）"
}

export async function canvasToPngDataUrl(value: unknown): Promise<string | null> {
  if (!value || typeof value !== "object") return null
  const { elements = [], appState = {} } = value as { elements?: unknown[]; appState?: Record<string, unknown> }
  if (!elements.length) return null
  const { exportToBlob } = await import("@excalidraw/excalidraw")
  const blob = await exportToBlob({
    elements: elements as never,
    appState: { viewBackgroundColor: "#ffffff", ...appState } as never,
    files: {},
    mimeType: "image/png",
  })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("白板截图失败"))
    reader.readAsDataURL(blob)
  })
}
