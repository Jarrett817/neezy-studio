import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Sparkles } from "lucide-react"
import { useCallback, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { PlaybookInputForm } from "~/components/playbook/playbook-input-form"
import { Button } from "~/components/ui/button"
import {
  compilePrompt,
  ensurePlaybookDirs,
  getScene,
  validateProfileSlots,
  type PlaybookSlots,
} from "~/services/playbook"
import { canvasToPngDataUrl } from "~/services/playbook/graph-serializers"
import {
  bindChatSessionPlaybook,
  setActiveSessionId,
  startNewPiChatSession,
} from "~/services/pi-chat-sessions"

/**
 * 场景运行页：全屏表单 → 填完后"开始生成"→ 新建对话 session → 跳转 /chat
 */
export default function SceneRunRoute() {
  const { playbookId = "" } = useParams()
  const navigate = useNavigate()
  const [slotValues, setSlotValues] = useState<Record<string, unknown>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: scene, isLoading } = useQuery({
    queryKey: ["scene", playbookId],
    queryFn: async () => {
      await ensurePlaybookDirs()
      return getScene(playbookId)
    },
    enabled: Boolean(playbookId),
  })

  const playbook = scene?.playbook ?? null
  const profile = scene?.inputProfile ?? null

  const handleStart = useCallback(async () => {
    if (!profile || !playbook) return
    if (!validateProfileSlots(profile, slotValues)) {
      toast.error("请填写必填项")
      return
    }

    setIsSubmitting(true)
    try {
      const compiled = compilePrompt(profile, { slots: slotValues as PlaybookSlots })
      const session = await startNewPiChatSession()
      await bindChatSessionPlaybook(session.id, playbook.id)
      await setActiveSessionId(session.id)
      sessionStorage.setItem("scene_first_message", compiled)
      sessionStorage.setItem("scene_playbook_id", playbook.id)
      const canvasField = profile.fields.find((f) => f.type === "canvas")
      if (canvasField) {
        const png = await canvasToPngDataUrl(slotValues[canvasField.key])
        if (png) sessionStorage.setItem("scene_first_image", png)
      }
      navigate(`/chat?session=${encodeURIComponent(session.id)}`, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "启动失败")
    } finally {
      setIsSubmitting(false)
    }
  }, [profile, playbook, slotValues, navigate])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载场景…
      </div>
    )
  }

  if (!playbook || !profile) {
    return (
      <div className="space-y-4 pt-8 text-center">
        <p className="text-sm text-muted-foreground">未找到该场景</p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/scenes">返回场景库</Link>
        </Button>
      </div>
    )
  }

  const isValid = validateProfileSlots(profile, slotValues)

  return (
    <div className="flex h-full w-full flex-col px-8 py-6">
      {/* 顶部导航 */}
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="size-8 rounded-lg">
          <Link to="/scenes">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{playbook.name}</h1>
          {playbook.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{playbook.description}</p>
          ) : null}
        </div>
      </div>

      {/* 表单区域 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PlaybookInputForm
          profileId={profile.id}
          profile={profile}
          formId="scene-run-form"
          hideSubmitButton
          disabled={isSubmitting}
          onValuesChange={setSlotValues}
          onSubmit={handleStart}
        />
      </div>

      {/* 底部操作栏 */}
      <div className="shrink-0 border-t border-border/30 pt-4 mt-4">
        <Button
          className="h-12 w-full gap-2 rounded-2xl text-base"
          disabled={!isValid || isSubmitting}
          onClick={handleStart}
        >
          <Sparkles className="size-5" />
          {isSubmitting ? "正在启动…" : "开始生成"}
        </Button>
      </div>
    </div>
  )
}
