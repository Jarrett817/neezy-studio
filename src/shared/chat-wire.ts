export type ChatWireToolCallStatus = "running" | "done" | "error"

export interface ChatWireToolCall {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  status: ChatWireToolCallStatus
  partialResult?: string
  result: string
}

/** 主进程 ↔ 渲染进程对话消息 IPC 载荷（与 UI store 的 ChatMessage 同构）。 */
export interface ChatWireMessage {
  id: string
  role: "user" | "assistant" | "error"
  content: string
  thinking: string
  toolCalls?: ChatWireToolCall[]
  timestamp: number
}
