import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useEffect, useMemo, useRef } from "react"

import { Label } from "~/components/ui/label"
import type { FlowchartValue } from "~/services/playbook/graph-serializers"

// ─── 自定义节点 ────────────────────────────────────────────

function StartEndNode({ data }: NodeProps) {
  return (
    <div className="flex h-10 min-w-[100px] items-center justify-center rounded-full border-2 border-primary/50 bg-primary/10 px-4 text-xs font-medium">
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-primary/50 !bg-white" />
      <span>{(data as { label?: string }).label}</span>
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-primary/50 !bg-white" />
    </div>
  )
}

function ProcessNode({ data }: NodeProps) {
  return (
    <div className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-border/60 bg-card px-4 text-xs shadow-sm">
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-border !bg-white" />
      <span>{(data as { label?: string }).label}</span>
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-border !bg-white" />
    </div>
  )
}

function DecisionNode({ data }: NodeProps) {
  return (
    <div className="relative flex size-20 items-center justify-center">
      <div className="absolute inset-0 rotate-45 rounded-md border-2 border-amber-400/60 bg-amber-50" />
      <span className="relative z-10 text-center text-[10px] font-medium leading-tight">{(data as { label?: string }).label}</span>
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-amber-400 !bg-white" />
      <Handle type="source" position={Position.Right} id="yes" className="!size-2 !border-2 !border-amber-400 !bg-white" />
      <Handle type="source" position={Position.Bottom} id="no" className="!size-2 !border-2 !border-amber-400 !bg-white" />
    </div>
  )
}

const nodeTypes = {
  startEnd: StartEndNode,
  process: ProcessNode,
  decision: DecisionNode,
}

// ─── 主组件 ────────────────────────────────────────────────

type FlowchartFieldProps = {
  value: unknown
  disabled?: boolean
  onChange: (value: FlowchartValue) => void
}

function normalize(value: unknown): FlowchartValue {
  if (
    value &&
    typeof value === "object" &&
    "nodes" in value &&
    Array.isArray((value as FlowchartValue).nodes)
  ) {
    return value as FlowchartValue
  }
  return {
    nodes: [
      { id: "1", type: "startEnd", data: { label: "开始" }, position: { x: 0, y: 80 } },
      { id: "2", type: "process", data: { label: "处理步骤" }, position: { x: 200, y: 80 } },
      { id: "3", type: "decision", data: { label: "判断?" }, position: { x: 400, y: 65 } },
      { id: "4", type: "startEnd", data: { label: "结束" }, position: { x: 620, y: 80 } },
    ],
    edges: [
      { id: "e1-2", source: "1", target: "2", animated: true },
      { id: "e2-3", source: "2", target: "3" },
      { id: "e3-4", source: "3", sourceHandle: "yes", target: "4", label: "是" },
    ],
  }
}

export function FlowchartField({ value, disabled, onChange }: FlowchartFieldProps) {
  const initial = useMemo(() => normalize(value), [value])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges as Edge[])
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    onChangeRef.current({
      nodes: nodes as FlowchartValue["nodes"],
      edges: edges as FlowchartValue["edges"],
    })
  }, [nodes, edges])

  const handleNodesChange = (changes: NodeChange[]) => {
    if (disabled) return
    onNodesChange(changes)
  }

  const handleEdgesChange = (changes: EdgeChange[]) => {
    if (disabled) return
    onEdgesChange(changes)
  }

  const onConnect = (connection: Connection) => {
    if (disabled) return
    setEdges((eds) => addEdge({ ...connection, animated: true }, eds))
  }

  const addNode = (type: "startEnd" | "process" | "decision") => {
    if (disabled) return
    const labels = { startEnd: "节点", process: "步骤", decision: "判断?" }
    const id = `${Date.now()}`
    const newNode: Node = {
      id,
      type,
      data: { label: labels[type] },
      position: { x: Math.random() * 400 + 50, y: Math.random() * 200 + 50 },
    }
    setNodes((nds) => [...nds, newNode])
  }

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-xl border border-border/60 bg-muted/10">
      {!disabled && (
        <div className="absolute top-2 right-2 z-10 flex gap-1.5">
          <button type="button" className="rounded-lg border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium shadow-sm hover:bg-accent/30"
            onClick={() => addNode("startEnd")} title="开始/结束节点">
            ⬭ 开始/结束
          </button>
          <button type="button" className="rounded-lg border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium shadow-sm hover:bg-accent/30"
            onClick={() => addNode("process")} title="流程节点">
            ▭ 流程
          </button>
          <button type="button" className="rounded-lg border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium shadow-sm hover:bg-accent/30"
            onClick={() => addNode("decision")} title="判断节点">
            ◇ 判断
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        fitView
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
        defaultEdgeOptions={{ type: "smoothstep", animated: true }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="hsl(var(--border) / 0.3)" />
        <Controls showInteractive={!disabled} className="!rounded-lg !border-border/60 !shadow-sm" />
        <MiniMap zoomable pannable className="!rounded-lg !border-border/60" />
      </ReactFlow>
    </div>
  )
}

export function FlowchartFieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label>
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
      <span className="ml-2 text-xs font-normal text-muted-foreground">
        拖拽节点 · 从锚点连线 · 双击编辑文字
      </span>
    </Label>
  )
}
