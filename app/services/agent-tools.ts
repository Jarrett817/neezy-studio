import { listMemories, saveMemory, searchMemories } from "~/services/memories"

export type ToolResult = {
  success: boolean
  result: string
}

export type Tool = {
  name: string
  description: string
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

// 记忆搜索
const memorySearchTool: Tool = {
  name: "memory_search",
  description: "搜索记忆中保存的内容。输入查询关键词，返回相关记忆。",
  execute: async (args) => {
    const { query } = args as { query: string }
    if (!query) return { success: false, result: "缺少查询参数" }
    try {
      const items = await searchMemories(query)
      if (items.length === 0) {
        return { success: true, result: "记忆中未找到相关内容" }
      }
      return {
        success: true,
        result: items
          .map((i) => `[${i.category}] ${i.title}\n${i.content}`)
          .join("\n\n"),
      }
    } catch (e) {
      return { success: false, result: `搜索失败: ${e}` }
    }
  },
}

// 存储记忆
const memoryAddTool: Tool = {
  name: "memory_add",
  description:
    "将重要内容存入长期记忆。输入标题、记忆内容。Agent 自动判断是否需要存入记忆。",
  execute: async (args) => {
    const { title, content, category } = args as {
      title: string
      content: string
      category?: string
    }
    if (!title || !content) return { success: false, result: "缺少标题或内容" }
    try {
      await saveMemory({ title, content, category: category || "记忆" })
      return { success: true, result: `已存入记忆: ${title}` }
    } catch (e) {
      return { success: false, result: `存储失败: ${e}` }
    }
  },
}

// 记录事件
const memoryEventTool: Tool = {
  name: "memory_event",
  description: "记录一个事件到记忆日志。输入事件内容。",
  execute: async (args) => {
    const { content } = args as { content: string }
    if (!content) return { success: false, result: "缺少内容" }
    try {
      // memory_event 是简化版，直接存入记忆
      await saveMemory({ title: "事件记录", content, category: "事件" })
      return { success: true, result: "已记录事件" }
    } catch (e) {
      return { success: false, result: `记录失败: ${e}` }
    }
  },
}

// 获取当前时间
const datetimeTool: Tool = {
  name: "datetime",
  description: "获取当前日期、时间和星期。无需输入参数。",
  execute: async () => {
    const now = new Date()
    return {
      success: true,
      result: now.toLocaleString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "long",
      }),
    }
  },
}

// 数学计算
const calculatorTool: Tool = {
  name: "calculator",
  description: "计算数学表达式。输入 expression 字段包含算式。",
  execute: async (args) => {
    const { expression } = args as { expression: string }
    if (!expression) return { success: false, result: "缺少表达式" }
    try {
      const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, "")
      const result = Function(`"use strict"; return (${sanitized})`)()
      return { success: true, result: `${expression} = ${result}` }
    } catch {
      return { success: false, result: "计算表达式无效" }
    }
  },
}

export const AVAILABLE_TOOLS: Tool[] = [
  memorySearchTool,
  memoryAddTool,
  memoryEventTool,
  datetimeTool,
  calculatorTool,
]

export function getToolByName(name: string): Tool | undefined {
  return AVAILABLE_TOOLS.find((t) => t.name === name)
}

export function getToolDefinitions(): {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}[] {
  return AVAILABLE_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: getToolParams(tool.name),
        required: getToolRequired(tool.name),
      },
    },
  }))
}

function getToolParams(
  name: string
): Record<string, { type: string; description: string }> {
  switch (name) {
    case "memory_search":
      return { query: { type: "string", description: "搜索关键词" } }
    case "memory_add":
      return {
        title: { type: "string", description: "记忆标题" },
        content: { type: "string", description: "记忆内容" },
        category: { type: "string", description: "分类（可选）" },
      }
    case "memory_event":
      return { content: { type: "string", description: "事件内容" } }
    case "datetime":
      return {}
    case "calculator":
      return {
        expression: { type: "string", description: "数学表达式，如 2+3*4" },
      }
    default:
      return {}
  }
}

function getToolRequired(name: string): string[] {
  switch (name) {
    case "memory_search":
      return ["query"]
    case "memory_add":
      return ["title", "content"]
    case "memory_event":
      return ["content"]
    case "calculator":
      return ["expression"]
    default:
      return []
  }
}
