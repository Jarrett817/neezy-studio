import type { StoragePaths } from "../types"
import {
  saveMemoryItem,
  searchMemoryItems,
  type MemoryStoreDeps,
} from "../memory-store"

export type OllamaTool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentToolRuntimeContext = MemoryStoreDeps & {
  getPaths: () => StoragePaths
}

let toolCtx: AgentToolRuntimeContext | null = null

export function setAgentToolRuntimeContext(ctx: AgentToolRuntimeContext): void {
  toolCtx = ctx
}

function requireCtx(): AgentToolRuntimeContext {
  if (!toolCtx) throw new Error("Agent 工具运行时未初始化")
  return toolCtx
}

export function getOllamaTools(): OllamaTool[] {
  return [
    {
      type: "function",
      function: {
        name: "memory_search",
        description: "搜索长期记忆中与查询语义相关的内容",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词或自然语言问题" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "memory_add",
        description: "将信息写入长期记忆（含向量索引）",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            category: { type: "string" },
          },
          required: ["title", "content"],
        },
      },
    },
  ]
}

export async function runToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const ctx = requireCtx()
  if (name === "memory_search") {
    const { text } = await searchMemoryItems(ctx, String(args.query ?? ""), 8)
    return text
  }
  if (name === "memory_add") {
    const saved = await saveMemoryItem(ctx, {
      title: String(args.title ?? ""),
      content: String(args.content ?? ""),
      category: args.category != null ? String(args.category) : undefined,
    })
    return `已存入记忆: ${saved.title}`
  }
  return `未知工具: ${name}`
}
