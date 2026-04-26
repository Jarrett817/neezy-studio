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
import {
  getAccountProfile,
  saveAccountProfile,
  type AccountProfile,
} from "~/services/workspace"
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
  const setActiveAccountName = useAppStore(
    (state) => state.setActiveAccountName
  )

  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
  })

  const { data: runtimeState, error: runtimeError } = useQuery({
    queryKey: ["model-runtime"],
    queryFn: getModelRuntimeState,
  })

  const saveProfileMutation = useMutation({
    mutationFn: saveAccountProfile,
    onSuccess: (nextProfile) => {
      queryClient.setQueryData(["account-profile"], nextProfile)
      setActiveAccountName(nextProfile.accountName)
    },
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
    values: profile ?? emptyProfile(),
  })

  const onSubmit = (values: ProfileFormValues) => {
    saveProfileMutation.mutate(values)
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="设置"
        title="账号与 Ollama 模型"
        description="账号配置保存到本机；大模型完全由本机 Ollama 管理，应用包不内置大模型。"
      />

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>账号创作配置</CardTitle>
          <CardDescription>保存后会写入本地配置文件。</CardDescription>
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

            <Field
              label="人设描述"
              error={form.formState.errors.persona?.message}
            >
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

            {saveProfileMutation.error instanceof Error ? (
              <p className="text-sm text-destructive">
                {saveProfileMutation.error.message}
              </p>
            ) : null}

            <Button type="submit" disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? "保存中" : "保存配置"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ollama 模型</CardTitle>
          <CardDescription>
            需要本机 Ollama 运行在 127.0.0.1:11434。下载按钮会调用 Ollama pull。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={runtimeState?.ollamaAvailable ? "secondary" : "outline"}>
              {runtimeState?.ollamaAvailable ? "Ollama 已连接" : "Ollama 未连接"}
            </Badge>
            <Badge variant="outline">应用包不包含大模型</Badge>
          </div>

          {runtimeError instanceof Error ? (
            <ErrorMessage message={runtimeError.message} />
          ) : null}
          {downloadMutation.error instanceof Error ? (
            <ErrorMessage message={downloadMutation.error.message} />
          ) : null}
          {setActiveMutation.error instanceof Error ? (
            <ErrorMessage message={setActiveMutation.error.message} />
          ) : null}

          {runtimeState?.models.map((model) => {
            const isActive = runtimeState.activeModelId === model.id
            const isDownloading =
              downloadMutation.isPending &&
              downloadMutation.variables === model.id
            const isSwitching =
              setActiveMutation.isPending &&
              setActiveMutation.variables === model.id

            return (
              <div
                key={model.id}
                className="rounded-lg border border-border/70 bg-background/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{model.name}</p>
                      <Badge variant="outline">{model.ollamaModel}</Badge>
                      <Badge variant={model.downloaded ? "secondary" : "outline"}>
                        {model.downloaded ? "Ollama 已安装" : "未安装"}
                      </Badge>
                      {isActive ? <Badge>当前默认</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {model.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {model.sizeLabel} · {model.minMemoryLabel}
                    </p>
                  </div>

                  {model.downloaded ? (
                    <Button
                      variant="outline"
                      disabled={isActive || isSwitching}
                      onClick={() => setActiveMutation.mutate(model.id)}
                    >
                      {isSwitching ? "切换中" : "设为默认"}
                    </Button>
                  ) : (
                    <Button
                      disabled={isDownloading || !runtimeState.ollamaAvailable}
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
                          用 Ollama 下载
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          <div className="rounded-lg border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2 className="size-4" />
              管理规则
            </p>
            <p className="mt-1">
              Ollama 是唯一的大模型管理器；Neezy Studio 只保存默认模型 ID 和运行记录，保持安装包精简。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function emptyProfile(): AccountProfile {
  return {
    accountName: "",
    track: "",
    persona: "",
    toneStyle: "",
    forbiddenWords: "",
  }
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

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  )
}
