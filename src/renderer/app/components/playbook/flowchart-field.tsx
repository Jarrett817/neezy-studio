import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useEffect, useMemo, useRef } from "react"

import { Label } from "~/components/ui/label"
import type { FlowchartValue } from "~/services/playbook/graph-serializers"

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
      { id: "1", data: { label: "开始" }, position: { x: 0, y: 0 } },
      { id: "2", data: { label: "步骤" }, position: { x: 200, y: 0 } },
    ],
    edges: [{ id: "e1-2", source: "1", target: "2" }],
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
    setEdges((eds) => addEdge(connection, eds))
  }

  return (
    <div className="h-56 w-full overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        fitView
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={12} size={1} />
        <Controls showInteractive={!disabled} />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  )
}

export function FlowchartFieldLabel({
  label,
  required,
}: {
  label: string
  required?: boolean
}) {
  return (
    <Label>
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
      <span className="ml-2 text-xs font-normal text-muted-foreground">
        拖拽节点、从锚点连线
      </span>
    </Label>
  )
}
