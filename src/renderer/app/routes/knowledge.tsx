import { Link, useSearchParams } from "react-router"
import { BookOpen, Brain, Sparkles } from "lucide-react"

import { KnowledgeLibraryPanel } from "~/components/knowledge/knowledge-library-panel"
import { MemoriesPanel } from "~/components/knowledge/memories-panel"
import { cn } from "~/lib/utils"
import PortraitRoute from "~/routes/portrait"

const tabs = [
  { id: "knowledge", label: "知识", icon: BookOpen, href: "/knowledge" },
  { id: "memory", label: "记忆", icon: Brain, href: "/knowledge?tab=memory" },
  { id: "persona", label: "人格", icon: Sparkles, href: "/knowledge?tab=persona" },
] as const

export default function KnowledgeRoute() {
  const [params] = useSearchParams()
  const tabParam = params.get("tab")
  const active =
    tabParam === "persona"
      ? "persona"
      : tabParam === "memory"
        ? "memory"
        : "knowledge"

  return (
    <div className="flex w-full flex-col gap-6 pt-2">
      <div className="flex gap-2 rounded-2xl border border-border/60 bg-card p-1 shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <Link
              key={tab.id}
              to={tab.href}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors",
                active === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </Link>
          )
        })}
      </div>
      {active === "persona" ? (
        <PortraitRoute />
      ) : active === "memory" ? (
        <MemoriesPanel />
      ) : (
        <KnowledgeLibraryPanel />
      )}
    </div>
  )
}
