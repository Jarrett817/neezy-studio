import {
  BookOpenText,
  ChartNoAxesColumn,
  FolderInput,
  Home,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
} from "lucide-react"

export const appNavigation = [
  {
    href: "/",
    label: "工作台",
    description: "数据概览",
    icon: Home,
  },
  {
    href: "/creator",
    label: "Agent 对话",
    description: "本地模型生成",
    icon: MessageSquareText,
  },
  {
    href: "/skills",
    label: "Skill 管理",
    description: "预置能力",
    icon: SlidersHorizontal,
  },
  {
    href: "/knowledge-base",
    label: "知识库",
    description: "多库管理",
    icon: BookOpenText,
  },
  {
    href: "/analytics",
    label: "数据复盘",
    description: "指标分析",
    icon: ChartNoAxesColumn,
  },
  {
    href: "/import",
    label: "数据录入",
    description: "采集任务",
    icon: FolderInput,
  },
  {
    href: "/settings",
    label: "设置",
    description: "账号与模型",
    icon: Settings2,
  },
] as const
