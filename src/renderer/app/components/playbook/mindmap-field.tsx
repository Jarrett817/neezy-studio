import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import type { MindmapNode } from "~/services/playbook/graph-serializers"

type MindmapFieldProps = {
  value: unknown
  disabled?: boolean
  onChange: (value: MindmapNode) => void
}

function normalize(value: unknown): MindmapNode {
  if (value && typeof value === "object" && "topic" in value) {
    return value as MindmapNode
  }
  return { topic: "", children: [] }
}

function NodeEditor({
  node,
  depth,
  disabled,
  onChange,
}: {
  node: MindmapNode
  depth: number
  disabled?: boolean
  onChange: (next: MindmapNode) => void
}) {
  return (
    <div className="space-y-2" style={{ marginLeft: depth * 12 }}>
      <div className="flex gap-2">
        <Input
          value={node.topic}
          disabled={disabled}
          className="h-8 rounded-lg text-sm"
          placeholder={depth === 0 ? "中心主题" : "节点"}
          onChange={(e) => onChange({ ...node, topic: e.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-lg text-xs"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...node,
              children: [...(node.children ?? []), { topic: "新节点", children: [] }],
            })
          }
        >
          +子节点
        </Button>
      </div>
      {(node.children ?? []).map((child, i) => (
        <NodeEditor
          key={`${depth}-${i}-${child.topic}`}
          node={child}
          depth={depth + 1}
          disabled={disabled}
          onChange={(nextChild) => {
            const children = [...(node.children ?? [])]
            children[i] = nextChild
            onChange({ ...node, children })
          }}
        />
      ))}
    </div>
  )
}

export function MindmapField({ value, disabled, onChange }: MindmapFieldProps) {
  const root = normalize(value)
  return (
    <NodeEditor
      node={root}
      depth={0}
      disabled={disabled}
      onChange={onChange}
    />
  )
}

export function MindmapFieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label>
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
    </Label>
  )
}
