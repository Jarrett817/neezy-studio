import { useState } from "react"
import { Sparkles } from "lucide-react"

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

export default function CreatorRoute() {
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="创作中心"
        title="准备真实模型工作流"
        description="当前没有接入可执行模型 runner，因此不会生成占位标题或正文。"
      />

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>创作输入</CardTitle>
          <CardDescription>
            这些字段会作为真实模型工作流的输入；模型 runner 接入前不会产出内容。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="本次选题">
            <Input placeholder="输入选题" />
          </Field>
          <Field label="创作目标">
            <Textarea placeholder="写清楚目标人群、平台、语气和限制条件" />
          </Field>
          <Field label="引用素材">
            <Textarea placeholder="粘贴真实素材或从知识库插入" />
          </Field>
          {message ? (
            <p className="text-sm text-destructive">{message}</p>
          ) : null}
          <Button
            className="gap-2"
            onClick={() => setMessage("未配置真实模型 runner，已阻止生成。")}
          >
            <Sparkles className="size-4" />
            生成草稿
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
