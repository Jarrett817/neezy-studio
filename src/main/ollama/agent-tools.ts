import fs from "node:fs/promises"
import path from "node:path"

import type { StoragePaths } from "../types"

export type OllamaTool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentToolRuntimeContext = {
  getPaths: () => StoragePaths
  runSelect: (
    dbPath: string,
    sql: string,
    params?: unknown[]
  ) => Promise<Record<string, unknown>[]>
  runExecute: (dbPath: string, sql: string, params?: unknown[]) => Promise<void>
  embedTexts: (text: string) => Promise<number[]>
}

let toolCtx: AgentToolRuntimeContext | null = null

export function setAgentToolRuntimeContext(ctx: AgentToolRuntimeContext): void {
  toolCtx = ctx
}

function requireCtx(): AgentToolRuntimeContext {
  if (!toolCtx) throw new Error("Agent 工具运行时未初始化")
  return toolCtx
}

async function searchMemories(query: string): Promise<string> {
  const ctx = requireCtx()
  const rows = await ctx.runSelect(
    ctx.getPaths().databaseFile,
    `SELECT title, category, content FROM memory_items
     WHERE title LIKE ? OR content LIKE ?
     ORDER BY updated_at DESC LIMIT 8`,
    [`%${query}%`, `%${query}%`]
  )
  if (rows.length === 0) return "记忆中未找到相关内容"
  return rows.map((r) => `[${r.category}] ${r.title}\n${r.content}`).join("\n\n")
}

async function addMemory(
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
  await ctx.runExecute(
    databaseFile,
    `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, cat, content, filePath, now, now]
  )
  return `已存入记忆: ${title}`
}

export function getOllamaTools(): OllamaTool[] {
  return [
    {
      type: "function",
      function: {
        name: "memory_search",
        description: "搜索长期记忆中与查询相关的内容",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "memory_add",
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
      },
    },
  ]
}

export async function runToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (name === "memory_search") {
    return searchMemories(String(args.query ?? ""))
  }
  if (name === "memory_add") {
    return addMemory(
      String(args.title ?? ""),
      String(args.content ?? ""),
      args.category != null ? String(args.category) : undefined
    )
  }
  return `未知工具: ${name}`
}
