import { FileInput, SlidersHorizontal, Wand2 } from "lucide-react"
import { Link } from "react-router"

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"

const tools = [
  {
    href: "/studio/skills",
    title: "Skill 管理",
    description: "导入、启用与维护 Agent 技能包。",
    icon: SlidersHorizontal,
  },
  {
    href: "/studio/input-profiles",
    title: "输入模板",
    description: "定义场景要问用户什么、如何编译 prompt。",
    icon: FileInput,
  },
  {
    href: "/studio/playbook-designer",
    title: "对话创建场景",
    description: "用自然语言描述任务，生成可运行场景配置。",
    icon: Wand2,
  },
] as const

export default function StudioIndexRoute() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">高级工作室</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Skill、输入模板与场景设计工具，日常创作请从工作台或「创作」进入。
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Card
              key={tool.href}
              className="rounded-2xl border border-border/60 bg-card shadow-sm"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Icon className="size-4 text-primary" />
                  {tool.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">{tool.description}</p>
                <Link
                  to={tool.href}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  进入 →
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
