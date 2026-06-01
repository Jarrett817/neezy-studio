export const MEMORY_CATEGORY = {
  KNOWLEDGE: "知识",
  MEMORY: "记忆",
} as const

export type MemoryCategory =
  (typeof MEMORY_CATEGORY)[keyof typeof MEMORY_CATEGORY]

function normalizeCategory(category: string | null | undefined): string {
  if (category == null || typeof category !== "string") return ""
  return category.trim()
}

/** 知识库 Tab：精确「知识」或「知识·…」子类 */
export function isKnowledgeCategory(category: string | null | undefined): boolean {
  const c = normalizeCategory(category)
  return (
    c === MEMORY_CATEGORY.KNOWLEDGE ||
    c.startsWith(`${MEMORY_CATEGORY.KNOWLEDGE}·`)
  )
}

/** 记忆 Tab：非知识类（含「记忆」「记忆·偏好」「事件」及 Agent 写入的其它类） */
export function isMemoryPanelCategory(category: string | null | undefined): boolean {
  return !isKnowledgeCategory(category)
}
