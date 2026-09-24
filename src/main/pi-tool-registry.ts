import { defineTool } from "@earendil-works/pi-coding-agent"
import type { ToolDefinition } from "../shared/pi-sdk"
import { Type } from "typebox"

import { appendSoul } from "./soul-store"

const soulWriteTool = defineTool({
  name: "soul_write",
  label: "soul_write",
  description:
    "把值得长期记住的偏好、结论、约定沉淀到 soul.md（跨会话持久）。仅在确有长期价值时调用，勿记录一次性琐事。",
  executionMode: "sequential",
  parameters: Type.Object({
    entry: Type.String({ description: "一句话沉淀内容" }),
  }),
  execute: async (_toolCallId, params) => {
    const p = params as { entry: string }
    await appendSoul(p.entry)
    return { content: [{ type: "text", text: "已沉淀到 soul.md" }], details: {} }
  },
})

const NEEZY_CUSTOM_TOOLS: ToolDefinition[] = [soulWriteTool]

export function getNeezyCustomTools(): ToolDefinition[] {
  return NEEZY_CUSTOM_TOOLS
}
