import { ArrowLeft } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { PlaybookRunTrace } from "~/services/playbook"

export type TaskRunStep = "fill" | "generating" | "result"

const STEPS: { id: TaskRunStep; label: string }[] = [
  { id: "fill", label: "填写需求" },
  { id: "generating", label: "生成中" },
  { id: "result", label: "查看结果" },
]

type TaskRunLayoutProps = {
  title: string
  description?: string
  step: TaskRunStep
  backHref?: string
  backLabel?: string
  capture: React.ReactNode
  result?: React.ReactNode
  trace?: PlaybookRunTrace
  playbookId?: string
}

export function TaskRunLayout({
  title,
  description,
  step,
  backHref = "/create",
  backLabel = "创作任务",
  capture,
  result,
  trace,
  playbookId,
}: TaskRunLayoutProps) {
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col pb-24">
      <Button asChild variant="ghost" size="sm" className="mb-4 w-fit gap-2 rounded-xl">
        <Link to={backHref}>
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
      </Button>

      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <ol className="flex gap-2">
          {STEPS.map((item, index) => {
            const done = index < stepIndex
            const active = index === stepIndex
            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium",
                  active && "border-primary/40 bg-primary/10 text-primary",
                  done && "border-border/60 bg-muted/40 text-foreground",
                  !active && !done && "border-border/40 bg-card text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-primary/20 text-primary",
                    !active && !done && "bg-muted"
                  )}
                >
                  {index + 1}
                </span>
                {item.label}
              </li>
            )
          })}
        </ol>
      </header>

      <section className="mt-8 space-y-6">
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">{capture}</div>
        {result ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">生成结果</h2>
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">{result}</div>
          </div>
        ) : null}
      </section>

      {trace && (step === "generating" || step === "result") ? (
        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border/60 bg-card px-6 py-3 shadow-sm">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {step === "generating" ? "生成中…" : `用时 ${trace.elapsedMs}ms`}
              {step === "result" ? ` · 引用记忆 ${trace.memoriesUsed} 条` : null}
            </span>
            {step === "result" ? (
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/chat">去对话</Link>
              </Button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  )
}
