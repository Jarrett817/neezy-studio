import { Search } from "lucide-react"

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
import { getWorkspaceSnapshot } from "~/services/workspace"

export default function KnowledgeBaseRoute() {
  const snapshot = {
    items: getWorkspaceSnapshot,
  }

  void snapshot

  const categories = ["爆款案例", "赛道干货", "模板素材", "禁忌词库"]

  const items = [
    {
      id: "item-1",
      title: "防晒类爆款标题模板",
      category: "爆款案例",
      detail: "适合学生党、平价、真实空瓶、避雷表达。",
    },
    {
      id: "item-2",
      title: "测评正文常用结构",
      category: "模板素材",
      detail: "结论先行、场景展开、优缺点总结、适用人群。",
    },
    {
      id: "item-3",
      title: "禁忌词与高风险表达",
      category: "禁忌词库",
      detail: "绝对化、夸大承诺、疑似医学功效相关词汇。",
    },
  ]

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="知识库"
        title="先把素材沉淀和复用做顺"
        description="V1 先用分类、标签和检索把素材沉淀做扎实，向量能力后面再挂。"
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="搜索标题、正文片段或标签" />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Badge key={category} variant="outline">
                {category}
              </Badge>
            ))}
          </div>
          <Button>新增素材</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>素材列表</CardTitle>
            <CardDescription>这里后面会接 FTS5 检索结果和分类筛选。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <Badge variant="secondary">{item.category}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>接入策略</CardTitle>
            <CardDescription>先用稳定能力撑住复用效率，再逐步增加复杂度。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>1. V1 主检索先用 SQLite FTS5。</p>
            <p>2. 使用次数和最近引用时间作为排序补充。</p>
            <p>3. 后续需要语义检索时，再评估轻量向量方案。</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
