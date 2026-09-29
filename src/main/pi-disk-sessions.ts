import { SessionManager } from "@earendil-works/pi-coding-agent"
import type { App } from "electron"
import fsSync from "node:fs"
import fs from "node:fs/promises"

import type { AgentMessage } from "../shared/pi-sdk"
import { formatWireUsage, type ChatWireMessage, type ChatWireToolCall } from "../shared/chat-wire"
import {
  sessionListPreview,
  sessionListTitle,
  toSessionInfoDto,
  type SessionInfoDto,
} from "../shared/pi-session-dto"
import { resolveStoragePaths, resolveWorkspaceDir } from "./storage-paths"
import path from "node:path"

export const PI_SESSIONS_DIR_NAME = "pi-sessions"

/** 与 @earendil-works/pi-coding-agent CURRENT_SESSION_VERSION 一致 */
const PI_SESSION_FILE_VERSION = 3

export type { SessionInfoDto }

/** Pi SDK 新建会话在首条 assistant 前不落盘；须先写 header 供 list/find 使用。 */
function flushPiSessionHeaderFile(sm: SessionManager): void {
  const file = sm.getSessionFile()
  if (!file) {
    throw new Error("Pi 会话文件路径未初始化")
  }
  if (fsSync.existsSync(file)) return
  const dir = path.dirname(file)
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true })
  }
  const header = {
    type: "session",
    version: PI_SESSION_FILE_VERSION,
    id: sm.getSessionId(),
    timestamp: new Date().toISOString(),
    cwd: sm.getCwd(),
  }
  fsSync.writeFileSync(file, `${JSON.stringify(header)}\n`, { flag: "wx" })
}

export function getPiSessionsDir(app: App): string {
  const { dataRoot } = resolveStoragePaths(app)
  return path.join(dataRoot, PI_SESSIONS_DIR_NAME)
}

function piSessionDirs(app: App) {
  const dataRoot = resolveStoragePaths(app).dataRoot
  return { dataRoot, sessionDir: getPiSessionsDir(app) }
}

export async function listPiChatSessions(app: App): Promise<SessionInfoDto[]> {
  const { sessionDir } = piSessionDirs(app)
  // 自定义 sessionDir 下 list(cwd) 会按 header.cwd 过滤；工作区切换后仍需看到全部会话
  const infos = await SessionManager.listAll(sessionDir)
  return infos.map(toSessionInfoDto).sort((a, b) => b.modified - a.modified)
}

export async function listPiChatSessionsWithMessages(
  app: App
): Promise<SessionInfoDto[]> {
  const all = await listPiChatSessions(app)
  return all.filter((s) => s.messageCount > 0)
}

export async function pruneEmptyPiChatSessions(
  app: App,
  keepSessionId?: string | null
): Promise<number> {
  const keepId = keepSessionId ?? null
  const sessions = await listPiChatSessions(app)
  let removed = 0
  for (const session of sessions) {
    if (keepId && session.id === keepId) continue
    if (session.messageCount > 0) continue
    await deletePiChatSession(app, session.id)
    removed += 1
  }
  return removed
}

export async function findPiSessionById(
  app: App,
  sessionId: string
): Promise<SessionInfoDto | null> {
  const sessions = await listPiChatSessions(app)
  return sessions.find((s) => s.id === sessionId) ?? null
}

export function openPiSessionManager(app: App, sessionFile: string): SessionManager {
  const { sessionDir } = piSessionDirs(app)
  // cwdOverride：工具操作落在当前工作区，而非会话创建时的 dataRoot
  return SessionManager.open(sessionFile, sessionDir, resolveWorkspaceDir(app))
}

export function createPiSessionManager(app: App): SessionManager {
  const { sessionDir } = piSessionDirs(app)
  const cwd = resolveWorkspaceDir(app)
  const sm = SessionManager.create(cwd, sessionDir)
  const file = sm.getSessionFile()
  if (!file) {
    throw new Error("Pi 会话文件路径未初始化")
  }
  flushPiSessionHeaderFile(sm)
  return SessionManager.open(file, sessionDir, cwd)
}

function textFromContent(content: unknown): { text: string; thinking: string } {
  if (typeof content === "string") {
    return { text: content, thinking: "" }
  }
  if (!Array.isArray(content)) {
    return { text: "", thinking: "" }
  }
  let text = ""
  let thinking = ""
  for (const block of content) {
    if (block && typeof block === "object" && "type" in block) {
      if (block.type === "text" && "text" in block && typeof block.text === "string") {
        text += block.text
      }
      if (
        block.type === "thinking" &&
        "thinking" in block &&
        typeof block.thinking === "string"
      ) {
        thinking += block.thinking
      }
    }
  }
  return { text, thinking }
}

function applyToolResult(
  messages: ChatWireMessage[],
  toolCallId: string,
  name: string,
  result: string,
  isError: boolean
): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "user") break
    const tool = m.toolCalls?.find((t) => t.toolCallId === toolCallId)
    if (tool) {
      tool.result = result
      tool.status = isError ? "error" : "done"
      if (!tool.name) tool.name = name
      return
    }
  }
}

function activityFromAssistantContent(
  content: unknown,
  timestamp: number
): { activity: ChatWireMessage["activity"]; toolCalls: ChatWireToolCall[] } {
  if (typeof content === "string") {
    const text = content.trim()
    return {
      activity: text ? [{ kind: "text", id: `text-${timestamp}`, text: content }] : [],
      toolCalls: [],
    }
  }
  if (!Array.isArray(content)) return { activity: [], toolCalls: [] }
  const activity: NonNullable<ChatWireMessage["activity"]> = []
  const toolCalls: ChatWireToolCall[] = []
  let i = 0
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block)) continue
    if (block.type === "thinking" && "thinking" in block && typeof block.thinking === "string") {
      const text = block.thinking.trim()
      if (text) activity.push({ kind: "thinking", id: `thinking-${timestamp}-${i}`, text })
      i += 1
      continue
    }
    if (block.type === "text" && "text" in block && typeof block.text === "string") {
      const text = block.text.trim()
      if (text) activity.push({ kind: "text", id: `text-${timestamp}-${i}`, text: block.text })
      i += 1
      continue
    }
    if (block.type === "toolCall") {
      const record = block as { id?: string; name?: string; arguments?: Record<string, unknown> }
      const toolCallId = typeof record.id === "string" ? record.id.trim() : ""
      const name = typeof record.name === "string" ? record.name.trim() : ""
      if (!toolCallId || !name) continue
      const args =
        record.arguments && typeof record.arguments === "object" ? record.arguments : {}
      toolCalls.push({ toolCallId, name, args, status: "running", result: "" })
      activity.push({ kind: "tool", toolCallId })
      i += 1
    }
  }
  return { activity, toolCalls }
}

function agentMessagesToWire(messages: AgentMessage[]): ChatWireMessage[] {
  const out: ChatWireMessage[] = []

  for (const msg of messages) {
    if (msg.role === "toolResult") {
      const toolCallId =
        "toolCallId" in msg && typeof msg.toolCallId === "string"
          ? msg.toolCallId.trim()
          : ""
      const name =
        "toolName" in msg && typeof msg.toolName === "string" ? msg.toolName.trim() : ""
      if (!toolCallId || !name) continue
      const result =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((b) => b && typeof b === "object" && "type" in b && b.type === "text")
                .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
                .join("")
            : ""
      const isError = "isError" in msg && msg.isError === true
      applyToolResult(out, toolCallId, name, result, isError)
      continue
    }
    if (msg.role === "user" && "timestamp" in msg) {
      out.push({
        id: `pi-${msg.timestamp}`,
        role: "user",
        content:
          typeof msg.content === "string" ? msg.content : textFromContent(msg.content).text,
        thinking: "",
        timestamp: msg.timestamp,
      })
      continue
    }
    if (msg.role === "assistant" && "timestamp" in msg) {
      const { text, thinking } = textFromContent(msg.content)
      const { activity, toolCalls } = activityFromAssistantContent(msg.content, msg.timestamp)
      if (!text.trim() && !thinking.trim() && toolCalls.length === 0) continue
      const usageSummary = formatWireUsage(
        "usage" in msg ? msg.usage : undefined
      )
      out.push({
        id: `pi-${msg.timestamp}`,
        role: "assistant",
        content: text,
        thinking,
        activity: activity?.length ? activity : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usageSummary,
        timestamp: msg.timestamp,
      })
    }
  }
  return out
}

export async function loadPiChatMessages(
  app: App,
  sessionId: string
): Promise<ChatWireMessage[]> {
  const meta = await findPiSessionById(app, sessionId)
  if (!meta) return []
  const sm = openPiSessionManager(app, meta.path)
  return agentMessagesToWire(sm.buildSessionContext().messages)
}

export async function createPiChatSession(app: App): Promise<SessionInfoDto> {
  const sm = createPiSessionManager(app)
  const file = sm.getSessionFile()
  if (!file) {
    throw new Error("Pi 会话文件创建失败")
  }
  const now = Date.now()
  return toSessionInfoDto({
    path: file,
    id: sm.getSessionId(),
    cwd: sm.getCwd(),
    created: new Date(now),
    modified: new Date(now),
    messageCount: 0,
    firstMessage: "",
    allMessagesText: "",
  })
}

export async function deletePiChatSession(app: App, sessionId: string): Promise<void> {
  const meta = await findPiSessionById(app, sessionId)
  if (!meta) return
  await fs.unlink(meta.path).catch((err) => {
    const code = err && typeof err === "object" && "code" in err ? err.code : ""
    if (code !== "ENOENT") throw err
  })
}

export { sessionListTitle, sessionListPreview }
