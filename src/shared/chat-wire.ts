export type ChatWireToolCallStatus = "running" | "done" | "error"

export interface ChatWireToolCall {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  status: ChatWireToolCallStatus
  partialResult?: string
  result: string
}

/** 按 Pi assistant.content 块顺序：思考 / 正文 / 工具 */
export type ChatWireActivityItem =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; toolCallId: string }

/** 主进程 ↔ 渲染进程对话消息 IPC 载荷（与 UI store 的 ChatMessage 同构）。 */
export interface ChatWireMessage {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
  activity?: ChatWireActivityItem[]
  toolCalls?: ChatWireToolCall[]
  timestamp: number
}
