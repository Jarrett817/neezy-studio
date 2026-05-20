import { getSetting, setSetting } from "~/services/storage/settings-store"

const PORTRAIT_KEY = "user_portrait_v1"

export type PortraitDimension = {
  id: string
  label: string
  score: number
  description: string
  evidence: string[]
}

export type PortraitTopic = {
  label: string
  weight: number
}

export type PortraitSignal = {
  text: string
  at: number
}

export type UserPortrait = {
  summary: string
  dimensions: PortraitDimension[]
  topics: PortraitTopic[]
  signals: PortraitSignal[]
  conversationTurns: number
  lastUpdatedAt: number
}

const DIMENSION_DEFS = [
  {
    id: "goal",
    label: "目标导向",
    description: "常把想法落到计划与可执行目标上。",
    words: [
      "计划",
      "目标",
      "完成",
      "推进",
      "想要",
      "希望",
      "需要",
      "打算",
      "安排",
      "项目",
    ],
  },
  {
    id: "expression",
    label: "表达偏好",
    description: "在意内容呈现、语气与写作风格。",
    words: [
      "写",
      "文案",
      "内容",
      "风格",
      "标题",
      "表达",
      "发布",
      "创作",
      "语气",
    ],
  },
  {
    id: "curiosity",
    label: "探索好奇",
    description: "愿意追问原因并尝试新思路。",
    words: [
      "为什么",
      "怎么",
      "如何",
      "学习",
      "研究",
      "分析",
      "试试",
      "灵感",
      "可能",
    ],
  },
  {
    id: "precision",
    label: "细节理性",
    description: "倾向核对细节、结构与准确性。",
    words: [
      "细节",
      "准确",
      "数据",
      "检查",
      "优化",
      "结构",
      "规则",
      "整理",
      "清单",
    ],
  },
  {
    id: "emotion",
    label: "情感开放",
    description: "会表露偏好、感受与个人态度。",
    words: [
      "喜欢",
      "讨厌",
      "感受",
      "开心",
      "担心",
      "害怕",
      "偏好",
      "习惯",
      "不舒服",
    ],
  },
  {
    id: "collaboration",
    label: "协作倾向",
    description: "关注协作语境与共同推进。",
    words: ["我们", "团队", "一起", "合作", "帮助", "沟通", "讨论", "同事"],
  },
] as const

const TOPIC_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "内容创作", re: /文案|写作|内容|发布|标题|账号/ },
  { label: "职场成长", re: /职场|工作|简历|面试|晋升|同事/ },
  { label: "学习研究", re: /学习|研究|课程|知识|阅读/ },
  { label: "产品技术", re: /产品|技术|代码|开发|设计|功能/ },
  { label: "生活健康", re: /健康|运动|饮食|睡眠|生活/ },
  { label: "效率工具", re: /效率|工具|自动化|流程|模板/ },
]

function emptyPortrait(): UserPortrait {
  return {
    summary: "继续对话后，系统会根据你的表达自动形成人格画像。",
    dimensions: DIMENSION_DEFS.map((d) => ({
      id: d.id,
      label: d.label,
      score: 0,
      description: d.description,
      evidence: [],
    })),
    topics: [],
    signals: [],
    conversationTurns: 0,
    lastUpdatedAt: 0,
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function compact(text: string, max = 96) {
  return text.replace(/\s+/g, " ").trim().slice(0, max)
}

function extractSignals(content: string): string[] {
  const parts = content
    .split(/[。！？\n；;]+/)
    .map((s) => compact(s))
    .filter((s) => s.length >= 8)
  const scored = parts
    .map((text) => ({
      text,
      score:
        (/我|我的|喜欢|不喜欢|习惯|偏好|希望|想要|计划|目标/.test(text)
          ? 2
          : 0) + (text.length >= 16 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, 2).map((s) => s.text)
}

function scoreDimensions(
  text: string,
  prev: PortraitDimension[]
): PortraitDimension[] {
  const lower = text.toLowerCase()
  return DIMENSION_DEFS.map((def, index) => {
    const hits = def.words.reduce((sum, word) => {
      const matches = lower.match(new RegExp(word, "g"))
      return sum + (matches?.length ?? 0)
    }, 0)
    const bump = hits > 0 ? Math.min(12, hits * 4) : 0
    const previous = prev[index]?.score ?? 0
    const nextScore = clampScore(previous * 0.92 + bump)
    const evidence = extractSignals(text)
    const mergedEvidence = [...evidence, ...(prev[index]?.evidence ?? [])]
      .filter((item, i, arr) => arr.indexOf(item) === i)
      .slice(0, 4)
    return {
      id: def.id,
      label: def.label,
      score: nextScore,
      description: def.description,
      evidence: mergedEvidence,
    }
  })
}

function scoreTopics(text: string, prev: PortraitTopic[]): PortraitTopic[] {
  const map = new Map(prev.map((t) => [t.label, t.weight]))
  for (const pattern of TOPIC_PATTERNS) {
    if (pattern.re.test(text)) {
      map.set(pattern.label, (map.get(pattern.label) ?? 0) + 8)
    }
  }
  return Array.from(map.entries())
    .map(([label, weight]) => ({ label, weight: clampScore(weight) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
}

function buildSummary(portrait: UserPortrait): string {
  const topDims = portrait.dimensions
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
  const topTopics = portrait.topics.slice(0, 3).map((t) => t.label)

  if (topDims.length === 0 && portrait.signals.length === 0) {
    return "继续对话后，系统会根据你的表达自动形成人格画像。"
  }

  const dimPart =
    topDims.length > 0
      ? `你展现出较强的「${topDims.map((d) => d.label).join("」与「")}」特征。`
      : ""
  const topicPart =
    topTopics.length > 0 ? `近期话题集中在：${topTopics.join("、")}。` : ""
  const signalPart = portrait.signals[0]?.text
    ? `最近表达：「${compact(portrait.signals[0].text, 48)}」`
    : ""

  return compact(`${dimPart}${topicPart}${signalPart}`, 220)
}

export async function getUserPortrait(): Promise<UserPortrait> {
  const stored = await getSetting<UserPortrait>(PORTRAIT_KEY)
  if (!stored) return emptyPortrait()
  return {
    ...emptyPortrait(),
    ...stored,
    dimensions:
      stored.dimensions?.length === DIMENSION_DEFS.length
        ? stored.dimensions
        : emptyPortrait().dimensions,
  }
}

export async function saveUserPortrait(
  portrait: UserPortrait
): Promise<UserPortrait> {
  await setSetting(PORTRAIT_KEY, portrait)
  return portrait
}

export async function resetUserPortrait(): Promise<UserPortrait> {
  return saveUserPortrait(emptyPortrait())
}

export async function updatePortraitFromConversation(input: {
  userContent: string
  assistantContent?: string
}): Promise<UserPortrait> {
  const userText = input.userContent.trim()
  if (userText.length < 6) return getUserPortrait()

  const portrait = await getUserPortrait()
  const dimensions = scoreDimensions(userText, portrait.dimensions)
  const topics = scoreTopics(userText, portrait.topics)
  const newSignals = extractSignals(userText).map((text) => ({
    text,
    at: Date.now(),
  }))
  const signals = [...newSignals, ...portrait.signals]
    .filter((s, i, arr) => arr.findIndex((x) => x.text === s.text) === i)
    .slice(0, 24)

  const next: UserPortrait = {
    dimensions,
    topics,
    signals,
    conversationTurns: portrait.conversationTurns + 1,
    lastUpdatedAt: Date.now(),
    summary: "",
  }
  next.summary = buildSummary(next)
  return saveUserPortrait(next)
}

export function portraitToMarkdown(portrait: UserPortrait): string {
  const updated = portrait.lastUpdatedAt
    ? new Date(portrait.lastUpdatedAt).toLocaleString("zh-CN")
    : "尚未更新"

  const dimLines = portrait.dimensions
    .sort((a, b) => b.score - a.score)
    .map((d) => {
      const bar =
        "█".repeat(Math.round(d.score / 10)) +
        "░".repeat(10 - Math.round(d.score / 10))
      const evidence =
        d.evidence.length > 0
          ? `\n  - 依据：${d.evidence.map((e) => `「${e}」`).join(" ")}`
          : ""
      return `- **${d.label}** ${d.score}/100 \`${bar}\`${evidence}\n  - ${d.description}`
    })
    .join("\n")

  const topicLines =
    portrait.topics.length > 0
      ? portrait.topics.map((t) => `- ${t.label}（${t.weight}）`).join("\n")
      : "- （暂无）"

  const signalLines =
    portrait.signals.length > 0
      ? portrait.signals
          .slice(0, 12)
          .map((s) => `- ${new Date(s.at).toLocaleString("zh-CN")}：${s.text}`)
          .join("\n")
      : "- （暂无）"

  return [
    "# 用户人格画像",
    "",
    "> 由 Neezy Studio 根据对话自动归纳，非用户手填表单。",
    "",
    "## 概览",
    "",
    portrait.summary || "（暂无概览）",
    "",
    `- 对话轮次：${portrait.conversationTurns}`,
    `- 最近更新：${updated}`,
    "",
    "## 维度分析",
    "",
    dimLines,
    "",
    "## 关注话题",
    "",
    topicLines,
    "",
    "## 近期表达线索",
    "",
    signalLines,
    "",
  ].join("\n")
}

export async function exportPortraitMarkdown(): Promise<void> {
  const portrait = await getUserPortrait()
  const markdown = portraitToMarkdown(portrait)
  const fileName = `user-portrait-${new Date().toISOString().slice(0, 10)}.md`

  if (typeof document === "undefined") return

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function getPortraitContextForPrompt(): Promise<string> {
  const portrait = await getUserPortrait()
  if (portrait.conversationTurns < 2) return ""

  const dims = portrait.dimensions
    .filter((d) => d.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((d) => `${d.label}(${d.score})`)
    .join("、")

  const topics = portrait.topics
    .slice(0, 4)
    .map((t) => t.label)
    .join("、")

  const signals = portrait.signals
    .slice(0, 3)
    .map((s) => s.text)
    .join("；")

  const parts = [
    dims ? `用户人格维度倾向：${dims}。` : "",
    topics ? `近期关注：${topics}。` : "",
    signals ? `近期表达线索：${signals}。` : "",
    portrait.summary ? `画像摘要：${portrait.summary}` : "",
  ].filter(Boolean)

  return parts.length > 0
    ? `\n\n【用户人格画像（对话自动归纳，供你个性化回应）】\n${parts.join("\n")}`
    : ""
}
