import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  getAgentPermissionSettings,
  resetAgentPermissionSettings,
  saveAgentPermissionSettings,
  PI_BUILTIN_TOOL_NAMES,
  PERMISSION_PRESETS,
  type AgentPermissionSettings,
  type PermissionPresetId,
  type PermissionState,
} from "~/services/agent-permissions"

const PERMISSION_STATE_LABELS: Record<PermissionState, string> = {
  allow: "允许",
  deny: "拒绝",
  ask: "询问",
}

const DEFAULT_POLICY_FIELDS = [
  { key: "tools" as const, label: "工具默认", hint: "未在下面单独列出的工具" },
  { key: "bash" as const, label: "Bash 默认", hint: "未匹配到具体命令模式时" },
  { key: "mcp" as const, label: "MCP 默认", hint: "MCP 代理目标" },
  { key: "skills" as const, label: "Skill 默认", hint: "技能加载与读取" },
  { key: "special" as const, label: "特殊项默认", hint: "未单独列出的 special 规则" },
]

const SPECIAL_FIELDS = [
  { key: "external_directory", label: "工作区外路径", hint: "read/write 等访问 cwd 之外的路径" },
  { key: "doom_loop", label: "死循环防护", hint: "检测到重复工具调用时" },
]

const PRESET_LABELS: Record<PermissionPresetId, string> = {
  strict: "严格",
  balanced: "平衡",
  permissive: "宽松",
}

function PermissionStateSelect({
  value,
  onChange,
  id,
}: {
  id: string
  value: PermissionState
  onChange: (value: PermissionState) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PermissionState)}>
      <SelectTrigger id={id} className="w-full rounded-xl bg-transparent">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PERMISSION_STATE_LABELS) as PermissionState[]).map((state) => (
          <SelectItem key={state} value={state}>
            {PERMISSION_STATE_LABELS[state]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AgentPermissionsSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["agent-permission-settings"],
    queryFn: getAgentPermissionSettings,
  })
  const [draft, setDraft] = useState<AgentPermissionSettings | null>(null)

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("配置未加载")
      return saveAgentPermissionSettings({
        policy: draft.policy,
        extension: draft.extension,
        sandbox: draft.sandbox,
      })
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["agent-permission-settings"], saved)
      setDraft(saved)
      toast.success("权限配置已保存", {
        description: "新建对话会话后策略会完整生效。",
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败")
    },
  })

  const resetMutation = useMutation({
    mutationFn: resetAgentPermissionSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(["agent-permission-settings"], saved)
      setDraft(saved)
      toast.success("已恢复默认权限配置")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复失败")
    },
  })

  const applyPreset = (preset: PermissionPresetId) => {
    if (!draft) return
    setDraft({
      ...draft,
      policy: structuredClone(PERMISSION_PRESETS[preset]),
    })
  }

  const patchTool = (tool: string, state: PermissionState) => {
    if (!draft) return
    setDraft({
      ...draft,
      policy: {
        ...draft.policy,
        tools: { ...draft.policy.tools, [tool]: state },
      },
    })
  }

  const patchBash = (state: PermissionState) => {
    if (!draft) return
    setDraft({
      ...draft,
      policy: {
        ...draft.policy,
        bash: { ...draft.policy.bash, "*": state },
      },
    })
  }

  const patchSpecial = (key: string, state: PermissionState) => {
    if (!draft) return
    setDraft({
      ...draft,
      policy: {
        ...draft.policy,
        special: { ...draft.policy.special, [key]: state },
      },
    })
  }

  const patchDefaultPolicy = (
    key: keyof AgentPermissionSettings["policy"]["defaultPolicy"],
    state: PermissionState
  ) => {
    if (!draft) return
    setDraft({
      ...draft,
      policy: {
        ...draft.policy,
        defaultPolicy: { ...draft.policy.defaultPolicy, [key]: state },
      },
    })
  }

  if (isLoading || !draft) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Agent 权限</h2>
        </div>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </section>
    )
  }

  const bashDefault = draft.policy.bash["*"] ?? draft.policy.defaultPolicy.bash

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Shield className="size-5 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">Agent 权限</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        由 pi-permission-system 在工具调用前拦截；策略为「询问」时会在对话页弹出确认框。
      </p>

      <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESET_LABELS) as PermissionPresetId[]).map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => applyPreset(preset)}
            >
              {PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 p-3">
          <p className="text-sm font-medium">默认策略</p>
          <div className="grid gap-3 md:grid-cols-2">
            {DEFAULT_POLICY_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`default-${field.key}`}>{field.label}</Label>
                <p className="text-xs text-muted-foreground">{field.hint}</p>
                <PermissionStateSelect
                  id={`default-${field.key}`}
                  value={draft.policy.defaultPolicy[field.key]}
                  onChange={(state) => patchDefaultPolicy(field.key, state)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 p-3">
          <p className="text-sm font-medium">内置工具</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PI_BUILTIN_TOOL_NAMES.map((tool) => (
              <div key={tool} className="space-y-1">
                <Label htmlFor={`tool-${tool}`}>{tool}</Label>
                <PermissionStateSelect
                  id={`tool-${tool}`}
                  value={draft.policy.tools[tool] ?? draft.policy.defaultPolicy.tools}
                  onChange={(state) => patchTool(tool, state)}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="bash-wildcard">bash（*）</Label>
              <p className="text-xs text-muted-foreground">所有 shell 命令</p>
              <PermissionStateSelect
                id="bash-wildcard"
                value={bashDefault}
                onChange={patchBash}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 p-3">
          <p className="text-sm font-medium">特殊规则</p>
          <div className="grid gap-3 md:grid-cols-2">
            {SPECIAL_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`special-${field.key}`}>{field.label}</Label>
                <p className="text-xs text-muted-foreground">{field.hint}</p>
                <PermissionStateSelect
                  id={`special-${field.key}`}
                  value={
                    draft.policy.special[field.key] ?? draft.policy.defaultPolicy.special
                  }
                  onChange={(state) => patchSpecial(field.key, state)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 p-4">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="yoloMode"
              checked={draft.extension.yoloMode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  extension: { ...draft.extension, yoloMode: e.target.checked },
                })
              }
              className="mt-1 size-4 rounded"
            />
            <div>
              <Label htmlFor="yoloMode">自动批准「询问」项（YOLO）</Label>
              <p className="text-xs text-muted-foreground">
                开启后不再弹出确认框，等同于全部放行 ask 规则。仅建议在可信环境使用。
              </p>
            </div>
          </div>

          {draft.sandboxSupported ? (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="sandboxEnabled"
                checked={draft.sandbox.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    sandbox: { enabled: e.target.checked },
                  })
                }
                className="mt-1 size-4 rounded"
              />
              <div>
                <Label htmlFor="sandboxEnabled">启用 pi-sandbox（macOS / Linux）</Label>
                <p className="text-xs text-muted-foreground">
                  OS 级 bash 隔离 + read/write/edit 路径策略；与上方权限规则叠加。
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              当前系统（Windows）不加载 pi-sandbox，仅使用 pi-permission-system 弹窗策略。
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">配置文件</p>
          <ul className="mt-2 space-y-1 font-mono break-all">
            <li>全局：{draft.globalPolicyPath}</li>
            <li>扩展：{draft.extensionConfigPath}</li>
            {draft.sandboxSupported ? <li>沙箱：{draft.sandboxConfigPath}</li> : null}
            <li>项目（可选覆盖）：{draft.projectPolicyPath}</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="rounded-xl"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "保存中…" : "保存权限配置"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
          >
            {resetMutation.isPending ? "恢复中…" : "恢复默认"}
          </Button>
        </div>
      </div>
    </section>
  )
}
