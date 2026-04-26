import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Download, LoaderCircle } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { SectionHeading } from "~/components/section-heading"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  downloadModel,
  getModelRuntimeState,
  setActiveModel,
} from "~/services/model-runtime"
import { getAccountProfile } from "~/services/workspace"
import { useAppStore } from "~/stores/app-store"

const profileSchema = z.object({
  accountName: z.string().min(1, "请输入账号名称"),
  track: z.string().min(1, "请输入赛道"),
  persona: z.string().min(10, "人设描述至少写 10 个字"),
  toneStyle: z.string().min(6, "语气风格至少写 6 个字"),
  forbiddenWords: z.string(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const setActiveAccountName = useAppStore((state) => state.setActiveAccountName)
  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
  })

  const { data: runtimeState } = useQuery({
    queryKey: ["model-runtime"],
    queryFn: getModelRuntimeState,
  })

  const downloadMutation = useMutation({
    mutationFn: downloadModel,
    onSuccess: (nextState) => {
      queryClient.setQueryData(["model-runtime"], nextState)
    },
  })

  const setActiveMutation = useMutation({
    mutationFn: setActiveModel,
    onSuccess: (nextState) => {
      queryClient.setQueryData(["model-runtime"], nextState)
    },
  })

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: profile ?? {
      accountName: "",
      track: "",
      persona: "",
      toneStyle: "",
      forbiddenWords: "",
    },
  })

  const onSubmit = (values: ProfileFormValues) => {
    setActiveAccountName(values.accountName)
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="设置"
        title="先把人设、语气和禁忌词收口"
        description="这些配置会直接影响后面的创作提示词、风格校准和风险规避，也是发文提效最值得先固化的一层。"
      />

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>账号创作配置</CardTitle>
          <CardDescription>当前先保存到前端状态，后面接数据库表和本地持久化。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <Field
              label="账号名称"
              error={form.formState.errors.accountName?.message}
            >
              <Input {...form.register("accountName")} />
            </Field>

            <Field label="赛道" error={form.formState.errors.track?.message}>
              <Input {...form.register("track")} />
            </Field>

            <Field label="人设描述" error={form.formState.errors.persona?.message}>
              <Textarea {...form.register("persona")} />
            </Field>

            <Field
              label="语气风格"
              error={form.formState.errors.toneStyle?.message}
            >
              <Textarea {...form.register("toneStyle")} />
            </Field>

            <Field label="禁忌词">
              <Textarea
                {...form.register("forbiddenWords")}
                placeholder="用逗号分隔，例如：绝对有效, 全网第一"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="submit">保存配置</Button>
              <Button type="button" variant="outline">
                清空禁忌词
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>端侧模型管理（手动下载）</CardTitle>
          <CardDescription>
            当前默认关闭自动下载。先手动选择模型，再按需下载并设为默认。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {runtimeState?.models.map((model) => {
            const isActive = runtimeState.activeModelId === model.id
            const isDownloading = downloadMutation.isPending && downloadMutation.variables === model.id
            const isSwitching = setActiveMutation.isPending && setActiveMutation.variables === model.id

            return (
              <div
                key={model.id}
                className="rounded-lg border border-border/70 bg-background/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{model.name}</p>
                      <Badge variant="outline">{model.quantization}</Badge>
                      {model.downloaded ? (
                        <Badge variant="secondary">已下载</Badge>
                      ) : (
                        <Badge variant="outline">未下载</Badge>
                      )}
                      {isActive ? <Badge>当前默认</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{model.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      模型体积 {model.sizeLabel} · {model.minMemoryLabel}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {model.downloaded ? (
                      <Button
                        variant="outline"
                        disabled={isActive || isSwitching}
                        onClick={() => setActiveMutation.mutate(model.id)}
                      >
                        {isSwitching ? (
                          <>
                            <LoaderCircle className="mr-2 size-4 animate-spin" />
                            切换中
                          </>
                        ) : (
                          "设为默认"
                        )}
                      </Button>
                    ) : (
                      <Button
                        disabled={isDownloading}
                        onClick={() => downloadMutation.mutate(model.id)}
                      >
                        {isDownloading ? (
                          <>
                            <LoaderCircle className="mr-2 size-4 animate-spin" />
                            下载中
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 size-4" />
                            手动下载
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <div className="rounded-lg border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2 className="size-4" />
              推荐策略
            </p>
            <p className="mt-1">
              首发先提供 2~3 个可选模型档位（速度优先 / 平衡 / 质量优先），默认不自动下载，避免占用磁盘和误触发大流量下载。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </label>
  )
}
