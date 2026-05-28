import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"
import type { UserPortrait } from "~/services/user-portrait"

export function PortraitDocumentPanel({ portrait }: { portrait: UserPortrait }) {
  const hasData = portrait.conversationTurns > 0
  const updatedLabel = portrait.lastUpdatedAt
    ? new Date(portrait.lastUpdatedAt).toLocaleString()
    : "—"

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-muted-foreground">摘要</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {hasData
            ? portrait.summary || "画像已建立，摘要生成中。"
            : "暂无画像。与助手多轮对话后，系统会自动归纳你的偏好与目标。"}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {portrait.conversationTurns} 轮对话 · 更新于 {updatedLabel}
        </p>
      </section>

      {portrait.dimensions.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">维度</h2>
          <ul className="space-y-4">
            {portrait.dimensions.map((dim) => (
              <li key={dim.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{dim.label}</span>
                  <span className="text-xs text-muted-foreground">{dim.score}%</span>
                </div>
                <progress
                  className="h-2 w-full overflow-hidden rounded-full accent-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                  value={Math.min(100, Math.max(0, dim.score))}
                  max={100}
                />
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {dim.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {portrait.topics.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">关注主题</h2>
          <div className="flex flex-wrap gap-2">
            {portrait.topics.map((topic) => (
              <Badge key={topic.label} variant="outline" className="text-xs">
                {topic.label}
                <span className="ml-1 text-muted-foreground">· {topic.weight}</span>
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      {portrait.signals.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">近期信号</h2>
          <ul className="space-y-2">
            {portrait.signals.slice(0, 12).map((signal, index) => (
              <li
                key={`${signal.at}-${index}`}
                className={cn(
                  "rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm leading-relaxed"
                )}
              >
                {signal.text}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {new Date(signal.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
