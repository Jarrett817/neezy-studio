import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { SectionHeading } from "~/components/section-heading"
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
  const setActiveAccountName = useAppStore((state) => state.setActiveAccountName)
  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: getAccountProfile,
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
