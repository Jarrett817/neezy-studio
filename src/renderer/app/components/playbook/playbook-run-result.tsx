import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import type { PlaybookRunResult } from "~/services/playbook"

type XhsItem = { title?: string; body?: string; tags?: string[] }

export function PlaybookRunResultPanel({
  result,
  showFooter = true,
}: {
  result: PlaybookRunResult
  showFooter?: boolean
}) {
  if (!result.ok) {
    return (
      <p className="text-sm text-destructive">{result.error ?? "执行失败"}</p>
    )
  }

  const items = result.output?.items as XhsItem[] | undefined
  if (Array.isArray(items) && items.length > 0) {
    return (
      <div className="space-y-3">
        {items.map((item, index) => (
          <Card key={index} className="rounded-2xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{item.title ?? `结果 ${index + 1}`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap leading-relaxed">{item.body}</p>
              {item.tags?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {showFooter ? (
          <p className="text-xs text-muted-foreground">
            用时 {result.trace.elapsedMs}ms · 引用记忆 {result.trace.memoriesUsed} 条
          </p>
        ) : null}
      </div>
    )
  }

  const text =
    typeof result.output?.text === "string"
      ? result.output.text
      : result.rawText

  const copyText = text ?? ""

  return (
    <div className="space-y-2">
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm">
        {copyText}
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          用时 {result.trace.elapsedMs}ms
        </p>
        {copyText ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => {
              void navigator.clipboard.writeText(copyText).then(
                () => toast.success("已复制"),
                () => toast.error("复制失败")
              )
            }}
          >
            复制全文
          </Button>
        ) : null}
      </div>
    </div>
  )
}
