import {
  BookOpenText,
  ChartNoAxesColumn,
  FolderInput,
  Home,
  MessageSquare,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
} from "lucide-react"

export const appNavigation = [
  { href: "/", label: "工作台", icon: Home },
  { href: "/chat", label: "模型对话", icon: MessageSquare },
  { href: "/creator", label: "Agent 创作", icon: MessageSquareText },
  { href: "/skills", label: "Skill 管理", icon: SlidersHorizontal },
  { href: "/knowledge-base", label: "知识库", icon: BookOpenText },
  { href: "/analytics", label: "数据复盘", icon: ChartNoAxesColumn },
  { href: "/import", label: "数据录入", icon: FolderInput },
  { href: "/settings", label: "设置中心", icon: Settings2 },
] as const
