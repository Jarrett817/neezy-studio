import {
  BookOpenText,
  ChartNoAxesColumn,
  FilePenLine,
  FolderInput,
  Home,
  Settings2,
} from "lucide-react"

export const appNavigation = [
  {
    href: "/",
    label: "工作台",
    description: "真实数据概览",
    icon: Home,
  },
  {
    href: "/creator",
    label: "创作中心",
    description: "模型工作流入口",
    icon: FilePenLine,
  },
  {
    href: "/knowledge-base",
    label: "知识库",
    description: "真实素材管理",
    icon: BookOpenText,
  },
  {
    href: "/analytics",
    label: "数据复盘",
    description: "真实指标分析",
    icon: ChartNoAxesColumn,
  },
  {
    href: "/import",
    label: "数据录入",
    description: "真实采集任务",
    icon: FolderInput,
  },
  {
    href: "/settings",
    label: "设置",
    description: "账号与模型",
    icon: Settings2,
  },
] as const
