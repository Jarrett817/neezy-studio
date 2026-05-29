import type { AgentTool } from "@earendil-works/pi-agent-core"
import fs from "node:fs/promises"
import path from "node:path"

export interface AgentToolRuntimeContext {
  getPaths: () => {
    databaseFile: string
    memoriesDir: string
  }
  runSelect: (
    dbPath: string,
    sql: string,
    params?: unknown[]
  ) => Promise<unknown[]>
  runExecute: (dbPath: string, sql: string, params?: unknown[]) => Promise<void>
  embedTexts: (text: string) => Promise<number[]>
}

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

interface MemoryRow {
  title: string
  category: string
  content: string
}

// ---------------------------------------------------------------------------
// Tool: memory_search
// ---------------------------------------------------------------------------
const memorySearchTool: AgentTool = {
  name: "memory_search",
  label: "memory_search",
  description: "搜索长期记忆中与查询相关的内容",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
    },
    required: ["query"],
  },
  execute: async (toolCallId, params) => {
    const ctx = requireCtx()
    const dbPath = ctx.getPaths().databaseFile
    const p = params as { query: string }
    const rows = (await ctx.runSelect(
      dbPath,
      `SELECT title, category, content FROM memory_items
       WHERE title LIKE ? OR content LIKE ?
       ORDER BY updated_at DESC LIMIT 8`,
      [`%${p.query}%`, `%${p.query}%`]
    )) as unknown as MemoryRow[]
    const text =
      rows.length === 0
        ? "记忆中未找到相关内容"
        : rows.map((r) => `[${r.category}] ${r.title}\n${r.content}`).join("\n\n")
    return { content: [{ type: "text", text }], details: { count: rows.length } }
  },
}

// ---------------------------------------------------------------------------
// Tool: memory_add
// ---------------------------------------------------------------------------
const memoryAddTool: AgentTool = {
  name: "memory_add",
  label: "memory_add",
  description: "将信息写入长期记忆",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      content: { type: "string" },
      category: { type: "string" },
    },
    required: ["title", "content"],
  },
  execute: async (toolCallId, params) => {
    const ctx = requireCtx()
    const p = params as { title: string; content: string; category?: string }
    const { memoriesDir, databaseFile } = ctx.getPaths()
    await fs.mkdir(memoriesDir, { recursive: true })
    const now = Date.now()
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21)
    const safeTitle = String(p.title ?? "")
      .replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "")
      .trim()
      .replace(/\s+/g, "_")
    const fileName = `${safeTitle || "memory"}_${now}.md`
    const filePath = path.join(memoriesDir, fileName)
    await fs.writeFile(filePath, `# ${p.title}\n\n${p.content}`, "utf8")
    await ctx.runExecute(
      databaseFile,
      `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, p.title, p.category || "记忆", p.content, filePath, now, now]
    )
    return { content: [{ type: "text", text: `已存入记忆: ${p.title}` }], details: { id } }
  },
}

// ---------------------------------------------------------------------------
// Tool: memory_event
// ---------------------------------------------------------------------------
const memoryEventTool: AgentTool = {
  name: "memory_event",
  label: "memory_event",
  description: "记录一个事件到记忆日志",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "事件内容" },
    },
    required: ["content"],
  },
  execute: async (toolCallId, params) => {
    const ctx = requireCtx()
    const p = params as { content: string }
    const { memoriesDir, databaseFile } = ctx.getPaths()
    await fs.mkdir(memoriesDir, { recursive: true })
    const now = Date.now()
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21)
    await fs.writeFile(
      path.join(memoriesDir, `event_${now}.md`),
      `# 事件记录\n\n${p.content}`,
      "utf8"
    )
    await ctx.runExecute(
      databaseFile,
      `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, "事件记录", "事件", p.content, "", now, now]
    )
    return { content: [{ type: "text", text: "已记录事件" }], details: { id } }
  },
}

// ---------------------------------------------------------------------------
// Tool: datetime
// ---------------------------------------------------------------------------
const datetimeTool: AgentTool = {
  name: "datetime",
  label: "datetime",
  description: "获取当前日期、时间和星期",
  parameters: { type: "object", properties: {} },
  execute: async (toolCallId, params) => {
    const now = new Date()
    const text = now.toLocaleString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    })
    return { content: [{ type: "text", text }], details: {} }
  },
}

// ---------------------------------------------------------------------------
// Tool: calculator
// ---------------------------------------------------------------------------
const calculatorTool: AgentTool = {
  name: "calculator",
  label: "calculator",
  description: "计算数学表达式",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "数学表达式，如 2+3*4" },
    },
    required: ["expression"],
  },
  execute: async (toolCallId, params) => {
    const p = params as { expression: string }
    const expr = String(p.expression ?? "")
    const sanitized = expr.replace(/[^0-9+\-*/.() ]/g, "")
    try {
      const result = Function(`"use strict"; return (${sanitized})`)()
      return {
        content: [{ type: "text", text: `${expr} = ${result}` }],
        details: { result },
      }
    } catch {
      return { content: [{ type: "text", text: "计算表达式无效" }], details: { error: true } }
    }
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
let registry: AgentTool[] = []

export function getToolRegistry(): AgentTool[] {
  if (registry.length === 0) {
    registry = [memorySearchTool, memoryAddTool, memoryEventTool, datetimeTool, calculatorTool]
  }
  return registry
}