import { FileInput, SlidersHorizontal, Wand2 } from "lucide-react"
import { NavLink, Outlet } from "react-router"

import { cn } from "~/lib/utils"

const studioNav = [
  { href: "/studio", label: "概览", end: true },
  { href: "/studio/skills", label: "Skill", icon: SlidersHorizontal, end: false },
  { href: "/studio/input-profiles", label: "输入模板", icon: FileInput, end: false },
  {
    href: "/studio/playbook-designer",
    label: "场景设计",
    icon: Wand2,
    end: false,
  },
] as const

export function StudioLayout() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pt-2 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:w-52">
        <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">高级工作室</p>
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {studioNav.map((item) => {
            const Icon = "icon" in item ? item.icon : undefined
            return (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors",
                    "hover:bg-muted/60",
                    isActive && "bg-primary/10 text-primary"
                  )
                }
              >
                {Icon ? <Icon className="size-4 shrink-0" /> : null}
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
