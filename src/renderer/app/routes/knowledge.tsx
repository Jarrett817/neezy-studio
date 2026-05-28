import { Link, useSearchParams } from "react-router"

import { cn } from "~/lib/utils"
import KnowledgeBaseRoute from "~/routes/knowledge-base"
import PortraitRoute from "~/routes/portrait"

const tabs = [
  { id: "library", label: "素材库", href: "/knowledge" },
  { id: "persona", label: "人格画像", href: "/knowledge?tab=persona" },
] as const

export default function KnowledgeRoute() {
  const [params] = useSearchParams()
  const active = params.get("tab") === "persona" ? "persona" : "library"

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-2">
      <div className="flex gap-2 rounded-2xl border border-border/60 bg-card p-1 shadow-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            to={tab.href}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-center text-sm font-medium transition-colors",
              active === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {active === "persona" ? <PortraitRoute /> : <KnowledgeBaseRoute />}
    </div>
  )
}
