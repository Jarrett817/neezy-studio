import { useQuery } from "@tanstack/react-query"
import { Command } from "cmdk"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import {
  FileText,
  Home,
  MessageSquare,
  PenLine,
  PlugZap,
  Settings2,
  Brain,
  SlidersHorizontal,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"
import { SCENE_CHAT_LAUNCH_STATE, sceneChatPath } from "~/lib/scene-chat-nav"
import { listPlaybooks } from "~/services/playbook"

const NAV_ITEMS = [
  { href: "/", label: "工作台", icon: Home, keywords: "home workbench" },
  { href: "/chat", label: "对话", icon: MessageSquare, keywords: "chat" },
  { href: "/scenes", label: "场景", icon: PenLine, keywords: "scenes playbook 创作" },
  { href: "/knowledge", label: "知识", icon: Brain, keywords: "knowledge 记忆" },
  { href: "/skills", label: "技能", icon: SlidersHorizontal, keywords: "skill" },
  { href: "/portrait", label: "画像", icon: Brain, keywords: "portrait 人格" },
  { href: "/connect", label: "AI 连接", icon: PlugZap, keywords: "api key model coding plan" },
  { href: "/settings", label: "设置", icon: Settings2, keywords: "settings" },
  { href: "/scenes/designer", label: "场景设计", icon: PenLine, keywords: "designer" },
] as const

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const { data: playbooks = [] } = useQuery({
    queryKey: ["playbooks"],
    queryFn: listPlaybooks,
    enabled: open,
    staleTime: 30_000,
  })

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

  const go = (href: string, state?: typeof SCENE_CHAT_LAUNCH_STATE) => {
    setOpen(false)
    navigate(href, state ? { state } : undefined)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>命令面板</DialogTitle>
          <DialogDescription>快速跳转到页面或场景</DialogDescription>
        </DialogHeader>
        <Command
          className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-popover"
          loop
        >
          <Command.Input
            placeholder="跳转页面或场景…"
            className="h-12 w-full border-b border-border/60 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              无匹配项
            </Command.Empty>
            {playbooks.length > 0 ? (
              <Command.Group heading="创作场景">
                {playbooks.map((pb) => (
                  <Command.Item
                    key={pb.id}
                    value={`${pb.name} ${pb.description ?? ""} ${pb.id} 场景 playbook`}
                    onSelect={() =>
                      go(sceneChatPath(pb.id), SCENE_CHAT_LAUNCH_STATE)
                    }
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-sm",
                      "aria-selected:bg-primary/10 aria-selected:text-primary"
                    )}
                  >
                    <span className="font-medium">{pb.name}</span>
                    {pb.description ? (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {pb.description}
                      </span>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
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
