import { useEffect, useRef, useCallback } from "react"
import MindElixir from "mind-elixir"
import "mind-elixir/style.css"
import { Label } from "~/components/ui/label"
import type { MindmapNode } from "~/services/playbook/graph-serializers"

// ─── 数据转换：MindmapNode ↔ MindElixir 格式 ─────────────

interface MeNode {
  id: string
  topic: string
  children?: MeNode[]
}

let nodeCounter = 0
function nextId(): string {
  return `me-${Date.now()}-${++nodeCounter}`
}

function toMeData(node: MindmapNode): MeNode {
  return {
    id: nextId(),
    topic: node.topic || "中心主题",
    children: (node.children ?? []).map(toMeData),
  }
}

function fromMeNode(node: MeNode): MindmapNode {
  return {
    topic: node.topic,
    children: (node.children ?? []).map(fromMeNode),
  }
}

function normalize(value: unknown): MindmapNode {
  if (value && typeof value === "object" && "topic" in value) {
    return value as MindmapNode
  }
  return { topic: "中心主题", children: [{ topic: "分支 1", children: [] }, { topic: "分支 2", children: [] }] }
}

// ─── 主组件 ────────────────────────────────────────────────

type MindmapFieldProps = {
  value: unknown
  disabled?: boolean
  onChange: (value: MindmapNode) => void
}

export function MindmapField({ value, disabled, onChange }: MindmapFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const meRef = useRef<InstanceType<typeof MindElixir> | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initializedRef = useRef(false)

  const syncToParent = useCallback(() => {
    const me = meRef.current
    if (!me) return
    const data = me.getData()
    if (data.nodeData) {
      onChangeRef.current(fromMeNode(data.nodeData as MeNode))
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    const root = normalize(value)
    const meData = toMeData(root)

    // 等待下一帧确保容器有尺寸
    requestAnimationFrame(() => {
      if (!containerRef.current) return

      const me = new MindElixir({
        el: containerRef.current,
        direction: MindElixir.RIGHT,
        draggable: !disabled,
        contextMenu: !disabled,
        toolBar: !disabled,
        nodeMenu: !disabled,
        keypress: !disabled,
        editable: !disabled,
      })

      me.init({ nodeData: meData })

      // 监听变化
      me.bus.addListener("operation", () => syncToParent())

      meRef.current = me
    })

    return () => {
      if (meRef.current) {
        meRef.current.destroy()
        meRef.current = null
      }
      initializedRef.current = false
    }
  }, []) // 只初始化一次

  return (
    <div
      ref={containerRef}
      className="h-80 w-full overflow-hidden rounded-xl border border-border/60 bg-white"
      style={{ position: "relative" }}
    />
  )
}

export function MindmapFieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label>
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
      <span className="ml-2 text-xs font-normal text-muted-foreground">
        Tab 添加子节点 · Enter 同级 · Delete 删除 · 双击编辑
      </span>
    </Label>
  )
}
