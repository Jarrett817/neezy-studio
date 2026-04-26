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
    description: "今天的创作与复盘概览",
    icon: Home,
  },
  {
    href: "/creator",
    label: "创作中心",
    description: "生成、编辑和沉淀草稿",
    icon: FilePenLine,
  },
  {
    href: "/knowledge-base",
    label: "知识库",
    description: "管理素材、模板和灵感",
    icon: BookOpenText,
  },
  {
    href: "/analytics",
    label: "数据复盘",
    description: "回看发文节奏与内容效果",
    icon: ChartNoAxesColumn,
  },
  {
    href: "/import",
    label: "截图导入",
    description: "半自动提取并人工确认入库",
    icon: FolderInput,
  },
  {
    href: "/settings",
    label: "设置",
    description: "账号人设、禁忌词与本地偏好",
    icon: Settings2,
  },
] as const
