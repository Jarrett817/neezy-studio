import { defineTool } from "@earendil-works/pi-coding-agent"
import type { ToolDefinition } from "../shared/pi-sdk"
import { Type } from "typebox"
import { app } from "electron"

import { searchCatalogWithInstallState } from "./skill-catalog"
import { installSkillByKey, listInstalledSkills } from "./skill-install"
import { saveMemoryItem, searchMemoryItems } from "./memory-store"
import { resolveStoragePaths } from "./storage-paths"

const memorySearchTool = defineTool({
  name: "memory_search",
  label: "memory_search",
  description: "搜索长期记忆中与查询语义相关的内容",
  executionMode: "parallel",
  parameters: Type.Object({
    query: Type.String({ description: "搜索关键词或自然语言问题" }),
  }),
  execute: async (_toolCallId, params) => {
    const p = params as { query: string }
    const { text, count } = await searchMemoryItems(p.query, 8)
    return { content: [{ type: "text", text }], details: { count } }
  },
})

const memoryAddTool = defineTool({
  name: "memory_add",
  label: "memory_add",
  description: "将信息写入长期记忆（含向量索引）",
  executionMode: "sequential",
  parameters: Type.Object({
    title: Type.String(),
    content: Type.String(),
    category: Type.Optional(Type.String()),
  }),
  execute: async (_toolCallId, params) => {
    const p = params as { title: string; content: string; category?: string }
    const saved = await saveMemoryItem({
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
  executionMode: "sequential",
  parameters: Type.Object({
    content: Type.String({ description: "事件内容" }),
  }),
  execute: async (_toolCallId, params) => {
    const p = params as { content: string }
    const now = Date.now()
    const saved = await saveMemoryItem({
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

const skillCatalogSearchTool = defineTool({
  name: "skill_catalog_search",
  label: "skill_catalog_search",
  description:
    "搜索可安装的 Skill 目录（Anthropic 官方 API / anthropics/skills、Cursor 官方 cursor/plugins）。返回 installKey、描述与是否已安装。",
  executionMode: "parallel",
  parameters: Type.Object({
    query: Type.String({ description: "搜索关键词，留空则列出全部" }),
  }),
  execute: async (_toolCallId, params) => {
    const p = params as { query: string }
    const dataRoot = resolveStoragePaths(app).dataRoot
    const installed = new Set(
      (await listInstalledSkills(dataRoot)).map((s) => s.installKey)
    )
    const hits = await searchCatalogWithInstallState(p.query ?? "", installed)
    const lines = hits.map(
      (h) =>
        `- ${h.installKey}${h.installed ? " (已安装)" : ""}: ${h.description.slice(0, 160)}`
    )
    const text =
      lines.length > 0
        ? lines.join("\n")
        : "未找到匹配的 skill，请换关键词或浏览全部（query 留空）。"
    return {
      content: [{ type: "text", text }],
      details: { count: hits.length, installKeys: hits.map((h) => h.installKey) },
    }
  },
})

const skillInstallTool = defineTool({
  name: "skill_install",
  label: "skill_install",
  description:
    "安装指定 skill（installKey 格式 publisher:id，如 anthropic:xlsx、cursor:cursor-team-kit--fix-ci）。安装后 Agent 可在后续回合使用该 skill。",
  executionMode: "sequential",
  parameters: Type.Object({
    installKey: Type.String({ description: "installKey，如 anthropic:xlsx" }),
  }),
  execute: async (_toolCallId, params) => {
    const p = params as { installKey: string }
    const dataRoot = resolveStoragePaths(app).dataRoot
    const installed = await installSkillByKey(dataRoot, p.installKey.trim())
    return {
      content: [
        {
          type: "text",
          text: `已安装 skill「${installed.name}」(${installed.installKey})。说明：${installed.description.slice(0, 200)}`,
        },
      ],
      details: { installKey: installed.installKey, skillDir: installed.skillDir },
    }
  },
})

const NEEZY_CUSTOM_TOOLS: ToolDefinition[] = [
  memorySearchTool,
  memoryAddTool,
  memoryEventTool,
  skillCatalogSearchTool,
  skillInstallTool,
]

export function getNeezyCustomTools(): ToolDefinition[] {
  return NEEZY_CUSTOM_TOOLS
}
