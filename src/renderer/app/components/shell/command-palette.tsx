import { Command } from "cmdk"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { MessageSquare, PlugZap, Settings2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"

const NAV_ITEMS = [
  { href: "/chat", label: "对话", icon: MessageSquare, keywords: "chat" },
  { href: "/connect", label: "AI 连接", icon: PlugZap, keywords: "api key model coding plan" },
  { href: "/settings", label: "设置", icon: Settings2, keywords: "settings" },
] as const

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    navigate(href)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>命令面板</DialogTitle>
          <DialogDescription>快速跳转到页面</DialogDescription>
        </DialogHeader>
        <Command
          className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-popover"
          loop
        >
          <Command.Input
            placeholder="跳转页面…"
            className="h-12 w-full border-b border-border/60 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              无匹配项
            </Command.Empty>
            <Command.Group heading="页面">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <Command.Item
                    key={item.href}
                    value={`${item.label} ${item.keywords}`}
                    onSelect={() => go(item.href)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                      "aria-selected:bg-primary/10 aria-selected:text-primary"
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-70" />
                    {item.label}
                  </Command.Item>
                )
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
