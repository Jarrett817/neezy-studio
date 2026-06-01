import { SessionManager } from "@earendil-works/pi-coding-agent"
import type { App } from "electron"
import fs from "node:fs/promises"

import type { AgentMessage } from "../shared/pi-sdk"
import type { ChatWireMessage, ChatWireToolCall } from "../shared/chat-wire"
import {
  sessionListPreview,
  sessionListTitle,
  toSessionInfoDto,
  type SessionInfoDto,
} from "../shared/pi-session-dto"
import { resolveStoragePaths } from "./storage-paths"
import path from "node:path"

export const PI_SESSIONS_DIR_NAME = "pi-sessions"

export type { SessionInfoDto }

export function getPiSessionsDir(app: App): string {
  const { dataRoot } = resolveStoragePaths(app)
  return path.join(dataRoot, PI_SESSIONS_DIR_NAME)
}

function piSessionDirs(app: App) {
  const dataRoot = resolveStoragePaths(app).dataRoot
  return { dataRoot, sessionDir: getPiSessionsDir(app) }
}

export async function listPiChatSessions(app: App): Promise<SessionInfoDto[]> {
  const { dataRoot, sessionDir } = piSessionDirs(app)
  const infos = await SessionManager.list(dataRoot, sessionDir)
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
  const { dataRoot, sessionDir } = piSessionDirs(app)
  return SessionManager.open(sessionFile, sessionDir, dataRoot)
}

export function createPiSessionManager(app: App): SessionManager {
  const { dataRoot, sessionDir } = piSessionDirs(app)
  return SessionManager.create(dataRoot, sessionDir)
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

function agentMessagesToWire(messages: AgentMessage[]): ChatWireMessage[] {
  const out: ChatWireMessage[] = []
  const pendingTools: ChatWireToolCall[] = []

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
      pendingTools.push({
        toolCallId,
        name,
        args: {},
        status: "done",
        result,
      })
      continue
    }
    if (msg.role === "user" && "timestamp" in msg) {
      pendingTools.length = 0
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
      const toolCalls = pendingTools.length > 0 ? [...pendingTools] : undefined
      pendingTools.length = 0
      if (!text.trim() && !thinking.trim() && !toolCalls) continue
      out.push({
        id: `pi-${msg.timestamp}`,
        role: "assistant",
        content: text,
        thinking,
        toolCalls,
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
