import { Sparkles, WandSparkles } from "lucide-react"

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

export default function CreatorRoute() {
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="创作中心"
        title="先把生成、编辑、沉淀三段式搭起来"
        description="这里先落业务结构，后面模型接入时只需要把生成区的数据源替换为真实工作流结果。"
      />

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr_0.92fr]">
        <Card>
          <CardHeader>
            <CardTitle>输入需求区</CardTitle>
            <CardDescription>选题、语气和限制条件先由这里统一收口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="本次选题">
              <Input defaultValue="百元内防晒霜真实空瓶复盘" />
            </Field>
            <Field label="创作目标">
              <Textarea defaultValue="突出平价、真实体验、适合学生党通勤。标题要有点击欲，但正文别油。" />
            </Field>
            <Field label="引用素材">
              <Textarea defaultValue="引用知识库中的爆款标题模板、防晒评测维度、禁忌表达清单。" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2">
                <Sparkles className="size-4" />
                开始生成
              </Button>
              <Button variant="outline">保存为草稿</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI 生成区</CardTitle>
            <CardDescription>这里后面会接 LangGraph 或普通 workflow 的输出。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">候选标题</p>
              <p className="mt-2 text-lg font-semibold">
                学生党别乱买，这 3 支百元内防晒我是真用空了
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">正文草案</p>
              <div className="mt-2 space-y-3 text-sm leading-7 text-muted-foreground">
                <p>
                  我最近连续空瓶了 3 支百元内防晒，先说结论：如果你是学生党、通勤族、预算有限，真的不用一上来追高价。
                </p>
                <p>
                  我更在意的是上脸有没有存在感、会不会搓泥、补涂的时候尴不尴尬，所以这次只按真实使用场景来聊。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">#平价防晒</Badge>
              <Badge variant="outline">#学生党好物</Badge>
              <Badge variant="outline">#真实空瓶</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>优化编辑区</CardTitle>
            <CardDescription>版本回滚、知识插入和一键复制都从这里接出去。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">最近版本</p>
              <VersionRow title="V5 · 标题收紧，正文口语化" time="10:32" />
              <VersionRow title="V4 · 插入知识库评测维度" time="10:05" />
              <VersionRow title="V3 · 清理绝对化表达" time="09:48" />
            </div>
            <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">当前状态</p>
              <div className="flex items-center justify-between text-sm">
                <span>已关联人设与禁忌词</span>
                <Badge>已启用</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>知识库命中 3 条</span>
                <Badge variant="secondary">可插入</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2">
                <WandSparkles className="size-4" />
                再润一版
              </Button>
              <Button>复制全文</Button>
            </div>
          </CardContent>
        </Card>
      </div>
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
    <label className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function VersionRow({ title, time }: { title: string; time: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm">
      <span>{title}</span>
      <span className="text-muted-foreground">{time}</span>
    </div>
  )
}
