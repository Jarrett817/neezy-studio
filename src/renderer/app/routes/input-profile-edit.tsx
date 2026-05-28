import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, Loader2, Save } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import {
  getInputProfile,
  inputProfileSchema,
  isBuiltinInputProfile,
  previewCompilePrompt,
  saveUserInputProfile,
} from "~/services/playbook"

export default function InputProfileEditRoute() {
  const { profileId = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ["input-profile", profileId],
    queryFn: () => getInputProfile(profileId),
    enabled: Boolean(profileId),
  })

  const builtin = isBuiltinInputProfile(profileId)
  const [jsonDraft, setJsonDraft] = useState("")

  useEffect(() => {
    if (profile) setJsonDraft(JSON.stringify(profile, null, 2))
  }, [profile])

  const samplePreview = useMemo(() => {
    if (!profile) return ""
    const sample: Record<string, string | number> = {}
    for (const f of profile.fields) {
      if (f.default !== undefined) sample[f.key] = f.default
      else if (f.type === "number") sample[f.key] = 3
      else sample[f.key] = `示例${f.label}`
    }
    return previewCompilePrompt(profile, sample)
  }, [profile])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = inputProfileSchema.parse(JSON.parse(jsonDraft))
      if (builtin && parsed.id === profileId) {
        const copy = { ...parsed, id: `${parsed.id}-copy-${Date.now()}` }
        await saveUserInputProfile(copy)
        return copy.id
      }
      await saveUserInputProfile(parsed)
      return parsed.id
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ["input-profiles"] })
      toast.success("已保存")
      navigate(`/studio/input-profiles/${id}`)
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "保存失败")
    },
  })

  if (isLoading) {
    return <p className="pt-4 text-sm text-muted-foreground">加载中…</p>
  }

  if (!profile) {
    return <p className="pt-4 text-sm text-destructive">模板不存在</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-4">
      <Button asChild variant="ghost" size="sm" className="gap-2 rounded-xl">
        <Link to="/studio/input-profiles">
          <ArrowLeft className="size-4" />
          输入模板
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile.id}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {builtin
            ? "内置模板只读；可另存为用户副本后编辑。"
            : "编辑字段与 promptTemplate，保存后引用该模板的场景将使用新版本。"}
        </p>
      </div>

      <div className="space-y-2">
        <Label>配置 JSON</Label>
        <Textarea
          value={jsonDraft}
          readOnly={builtin}
          className="min-h-72 font-mono text-xs rounded-xl"
          onChange={(e) => setJsonDraft(e.target.value)}
        />
        <Button
          className="gap-2 rounded-xl"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : builtin ? (
            <Copy className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          {builtin ? "另存为用户模板" : "保存"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label>编译预览（示例槽位）</Label>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-xs leading-relaxed">
          {samplePreview}
        </pre>
      </div>
    </div>
  )
}
