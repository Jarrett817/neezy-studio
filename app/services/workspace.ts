export type DashboardSummary = {
  draftCount: number
  readyToPublishCount: number
  knowledgeCount: number
  weeklyPostCount: number
}

export type TodoItem = {
  id: string
  title: string
  detail: string
}

export type DraftPreview = {
  id: string
  title: string
  status: "draft" | "review" | "published"
  updatedAt: string
}

export type KnowledgePreview = {
  id: string
  title: string
  category: string
  lastUsedAt: string
}

export type MetricPoint = {
  label: string
  views: number
  saves: number
}

export type WorkspaceSnapshot = {
  summary: DashboardSummary
  todos: TodoItem[]
  drafts: DraftPreview[]
  knowledge: KnowledgePreview[]
  metrics: MetricPoint[]
}

export type AccountProfile = {
  accountName: string
  track: string
  persona: string
  toneStyle: string
  forbiddenWords: string
}

const snapshot: WorkspaceSnapshot = {
  summary: {
    draftCount: 12,
    readyToPublishCount: 4,
    knowledgeCount: 86,
    weeklyPostCount: 3,
  },
  todos: [
    {
      id: "todo-1",
      title: "补齐 3 篇平价防晒选题",
      detail: "创作中心已有 2 个半成品，可直接扩写。",
    },
    {
      id: "todo-2",
      title: "整理上周爆文评论高频问题",
      detail: "优先沉淀到知识库的问答分类。",
    },
    {
      id: "todo-3",
      title: "录入 4 月最后一周数据",
      detail: "先补阅读、收藏、评论，再看标签表现。",
    },
  ],
  drafts: [
    {
      id: "draft-1",
      title: "百元内防晒霜真实空瓶复盘",
      status: "review",
      updatedAt: "今天 09:20",
    },
    {
      id: "draft-2",
      title: "通勤妆 5 分钟提气色步骤",
      status: "draft",
      updatedAt: "昨天 22:14",
    },
    {
      id: "draft-3",
      title: "学生党底妆避雷清单",
      status: "published",
      updatedAt: "04-24 18:30",
    },
  ],
  knowledge: [
    {
      id: "knowledge-1",
      title: "防晒类爆款标题模板",
      category: "爆款案例",
      lastUsedAt: "今天",
    },
    {
      id: "knowledge-2",
      title: "学生党价格敏感表达库",
      category: "赛道干货",
      lastUsedAt: "昨天",
    },
    {
      id: "knowledge-3",
      title: "禁忌词与绝对化表达清单",
      category: "违禁词库",
      lastUsedAt: "04-23",
    },
  ],
  metrics: [
    { label: "周一", views: 820, saves: 63 },
    { label: "周二", views: 1160, saves: 88 },
    { label: "周三", views: 930, saves: 57 },
    { label: "周四", views: 1420, saves: 105 },
    { label: "周五", views: 1210, saves: 91 },
  ],
}

const profile: AccountProfile = {
  accountName: "小红书主账号",
  track: "平价美妆 / 学生党好物",
  persona: "真实试用、结论直接、优先给普通预算人群可复制建议。",
  toneStyle: "像关系很好的朋友在做认真复盘，少一点营销话术，多一点经验结论。",
  forbiddenWords: "绝对有效, 全网第一, 永不踩雷",
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return snapshot
}

export async function getAccountProfile(): Promise<AccountProfile> {
  return profile
}
