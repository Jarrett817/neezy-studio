import { defineTool } from "@earendil-works/pi-coding-agent"
import type { ToolDefinition } from "../shared/pi-sdk"
import { Type } from "typebox"

import { saveMemoryItem, searchMemoryItems, type MemoryStoreDeps } from "./memory-store"

export type AgentToolRuntimeContext = MemoryStoreDeps

let toolCtx: AgentToolRuntimeContext | null = null

export function initToolContext(ctx: AgentToolRuntimeContext): void {
  toolCtx = ctx
}

function requireCtx(): AgentToolRuntimeContext {
  if (!toolCtx) {
    throw new Error("Agent 工具运行时未初始化")
  }
  return toolCtx
}

const memorySearchTool = defineTool({
  name: "memory_search",
  label: "memory_search",
  description: "搜索长期记忆中与查询语义相关的内容",
  parameters: Type.Object({
    query: Type.String({ description: "搜索关键词或自然语言问题" }),
  }),
  execute: async (_toolCallId, params) => {
    const ctx = requireCtx()
    const p = params as { query: string }
    const { text, count } = await searchMemoryItems(ctx, p.query, 8)
    return { content: [{ type: "text", text }], details: { count } }
  },
})

const memoryAddTool = defineTool({
  name: "memory_add",
  label: "memory_add",
  description: "将信息写入长期记忆（含向量索引）",
  parameters: Type.Object({
    title: Type.String(),
    content: Type.String(),
    category: Type.Optional(Type.String()),
  }),
  execute: async (_toolCallId, params) => {
    const ctx = requireCtx()
    const p = params as { title: string; content: string; category?: string }
    const saved = await saveMemoryItem(ctx, {
      title: p.title,
      content: p.content,
      category: p.category,
    })
    return {
      content: [{ type: "text", text: `已存入记忆: ${saved.title}` }],
      details: { id: saved.id },
    }
  },
})

const memoryEventTool = defineTool({
  name: "memory_event",
  label: "memory_event",
  description: "记录一个事件到记忆日志（含向量索引）",
  parameters: Type.Object({
    content: Type.String({ description: "事件内容" }),
  }),
  execute: async (_toolCallId, params) => {
    const ctx = requireCtx()
    const p = params as { content: string }
    const now = Date.now()
    const saved = await saveMemoryItem(ctx, {
      title: "事件记录",
      content: p.content,
      category: "事件",
      fileName: `event_${now}.md`,
    })
    return {
      content: [{ type: "text", text: "已记录事件" }],
      details: { id: saved.id },
    }
  },
})

let registry: ToolDefinition[] = []

export function getNeezyCustomTools(): ToolDefinition[] {
  if (registry.length === 0) {
    registry = [memorySearchTool, memoryAddTool, memoryEventTool]
  }
  return registry
}
