import fs from "node:fs/promises"
import path from "node:path"

import type { ChatSessionModelFunctions } from "node-llama-cpp"

import { getLlamaModule } from "./node-llama-runtime"
import type { StoragePaths } from "./types"

export type AgentToolRuntimeContext = {
  getPaths: () => StoragePaths
  runSelect: (dbPath: string, sql: string, params?: unknown[]) => Record<string, unknown>[]
  runExecute: (dbPath: string, sql: string, params?: unknown[]) => void
  embedTexts: (text: string) => Promise<number[]>
}

let toolCtx: AgentToolRuntimeContext | null = null

export function setAgentToolRuntimeContext(ctx: AgentToolRuntimeContext): void {
  toolCtx = ctx
}

function requireCtx(): AgentToolRuntimeContext {
  if (!toolCtx) {
    throw new Error("Agent 工具运行时未初始化")
  }
  return toolCtx
}

async function searchMemoriesMain(query: string): Promise<string> {
  const ctx = requireCtx()
  const dbPath = ctx.getPaths().databaseFile
  const rows = ctx.runSelect(
    dbPath,
    `SELECT title, category, content FROM memory_items
     WHERE title LIKE ? OR content LIKE ?
     ORDER BY updated_at DESC LIMIT 8`,
    [`%${query}%`, `%${query}%`]
  )
  if (rows.length === 0) return "记忆中未找到相关内容"
  return rows
    .map((r) => `[${r.category}] ${r.title}\n${r.content}`)
    .join("\n\n")
}

async function addMemoryMain(
  title: string,
  content: string,
  category?: string
): Promise<string> {
  const ctx = requireCtx()
  const { memoriesDir, databaseFile } = ctx.getPaths()
  await fs.mkdir(memoriesDir, { recursive: true })
  const now = Date.now()
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21)
  const safeTitle = title
    .replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
  const fileName = `${safeTitle || "memory"}_${now}.md`
  const filePath = path.join(memoriesDir, fileName)
  await fs.writeFile(filePath, `# ${title}\n\n${content}`, "utf8")
  const cat = category || "记忆"
  ctx.runExecute(
    databaseFile,
    `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, cat, content, filePath, now, now]
  )
  return `已存入记忆: ${title}`
}

export async function buildChatSessionFunctions(): Promise<ChatSessionModelFunctions> {
  const { defineChatSessionFunction } = await getLlamaModule()

  return {
    memory_search: defineChatSessionFunction({
      description: "搜索长期记忆中与查询相关的内容",
      params: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
      async handler(params) {
        const query = String(params.query ?? "").trim()
        if (!query) return "缺少 query 参数"
        try {
          return await searchMemoriesMain(query)
        } catch (e) {
          return `搜索失败: ${e instanceof Error ? e.message : String(e)}`
        }
      },
    }),
    memory_add: defineChatSessionFunction({
      description: "将重要信息写入长期记忆",
      params: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          category: { type: "string" },
        },
      },
      async handler(params) {
        const title = String(params.title ?? "").trim()
        const content = String(params.content ?? "").trim()
        if (!title || !content) return "缺少 title 或 content"
        try {
          return await addMemoryMain(
            title,
            content,
            params.category ? String(params.category) : undefined
          )
        } catch (e) {
          return `存储失败: ${e instanceof Error ? e.message : String(e)}`
        }
      },
    }),
    memory_event: defineChatSessionFunction({
      description: "记录一条事件到记忆",
      params: {
        type: "object",
        properties: {
          content: { type: "string" },
        },
      },
      async handler(params) {
        const content = String(params.content ?? "").trim()
        if (!content) return "缺少 content"
        try {
          return await addMemoryMain("事件记录", content, "事件")
        } catch (e) {
          return `记录失败: ${e instanceof Error ? e.message : String(e)}`
        }
      },
    }),
    datetime: defineChatSessionFunction({
      description: "获取当前本地日期时间",
      params: { type: "object", properties: {} },
      handler() {
        return new Date().toLocaleString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          weekday: "long",
        })
      },
    }),
    calculator: defineChatSessionFunction({
      description: "计算数学表达式",
      params: {
        type: "object",
        properties: {
          expression: { type: "string" },
        },
      },
      handler(params) {
        const expression = String(params.expression ?? "").trim()
        if (!expression) return "缺少 expression"
        const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, "")
        try {
          const result = Function(`"use strict"; return (${sanitized})`)()
          return `${expression} = ${result}`
        } catch {
          return "计算表达式无效"
        }
      },
    }),
  }
}
