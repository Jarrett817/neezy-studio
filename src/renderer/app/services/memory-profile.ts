import { MEMORY_CATEGORY } from "~/config/memory-categories"
import {
  listMemories,
  saveMemory,
  searchMemories,
  type MemoryItem,
} from "~/services/memories"

export type MemoryProfile = {
  total: number
  focusAreas: { label: string; count: number }[]
  traits: { label: string; score: number; description: string }[]
  recentSignals: string[]
}

const TRAIT_RULES = [
  {
    label: "目标感",
    words: ["计划", "目标", "复盘", "推进", "完成", "项目", "效率", "安排"],
    description: "经常把想法落成可执行事项。",
  },
  {
    label: "表达欲",
    words: ["写", "表达", "文案", "内容", "风格", "标题", "发布", "创作"],
    description: "在意语言的效果和内容呈现。",
  },
  {
    label: "探索性",
    words: ["为什么", "研究", "分析", "学习", "尝试", "灵感", "想法", "可能"],
    description: "喜欢追问原因，也愿意试新路径。",
  },
  {
    label: "细节感",
    words: ["细节", "检查", "优化", "准确", "结构", "规则", "整理", "清单"],
    description: "倾向于把复杂信息整理清楚。",
  },
]

function compactText(text: string, max = 120) {
  return text.replace(/\s+/g, " ").trim().slice(0, max)
}

export async function buildMemoryProfile(): Promise<MemoryProfile> {
  const memories = await listMemories()
  const categoryCounts = new Map<string, number>()
  const allText = memories
    .map((item) => `${item.title} ${item.category} ${item.content}`)
    .join("\n")
    .toLowerCase()

  for (const item of memories) {
    categoryCounts.set(
      item.category,
      (categoryCounts.get(item.category) ?? 0) + 1
    )
  }

  const focusAreas = Array.from(categoryCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const traits = TRAIT_RULES.map((rule) => {
    const hits = rule.words.reduce((sum, word) => {
      const matches = allText.match(new RegExp(word, "g"))
      return sum + (matches?.length ?? 0)
    }, 0)
    return {
      label: rule.label,
      score:
        memories.length === 0
          ? 0
          : Math.min(
              100,
              Math.round((hits / Math.max(3, memories.length)) * 35)
            ),
      description: rule.description,
    }
  }).sort((a, b) => b.score - a.score)

  const recentSignals = memories
    .slice()
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 5)
    .map((item) => compactText(item.content))
    .filter(Boolean)

  return {
    total: memories.length,
    focusAreas,
    traits,
    recentSignals,
  }
}

export async function getRelevantMemories(
  input: string,
  limit = 5
): Promise<MemoryItem[]> {
  if (!input.trim()) return []
  return searchMemories(input, limit)
}

export async function rememberConversationTurn(input: {
  userContent: string
  assistantContent: string
}): Promise<void> {
  const content = input.userContent.trim()
  if (content.length < 12) return

  const important =
    /我(喜欢|偏好|习惯|正在|想要|希望|需要|不喜欢|讨厌|害怕|计划|决定)|记住|以后|我的|我们|项目|目标|账号|人设|风格/.test(
      content
    )

  if (!important && content.length < 80) return

  const title = content.length > 28 ? `${content.slice(0, 28)}...` : content
  await saveMemory({
    title,
    content: `用户说：${content}\n\n当时的回应：${compactText(input.assistantContent, 180)}`,
    category: important ? `${MEMORY_CATEGORY.MEMORY}·偏好` : MEMORY_CATEGORY.MEMORY,
  })
}
