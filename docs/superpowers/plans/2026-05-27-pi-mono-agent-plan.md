# Pi-Mono Agent 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `pi-agent-core` + `pi-ai` (Ollama) 替换现有单轮 chat wrapper，实现多轮 ReAct Agent；统一工具注册表在主进程。

**Architecture:** Agent 引擎跑在 Electron 主进程，每会话一个 `Agent` 实例，工具统一在主进程注册，Renderer 通过 IPC 事件订阅接收流式输出。

**Tech Stack:** `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、Electron IPC

---

## 文件结构

```
electron/
  pi-agent.ts           # AgentSessions 管理器（新建）
  pi-tool-registry.ts   # 统一工具注册表（新建）
  ipc-handlers.ts       # 注册 agent:* handlers（修改）

app/services/
  pi-agent-client.ts   # Renderer 侧 IPC 封装 + 事件订阅（新建）
  agent-tools.ts       # 现有 Renderer 工具（删除或清空）

app/routes/
  chat.tsx             # 对话页面接入（修改）
```

---

## 实现顺序

### Task 1: 安装 pi-mono 包

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加依赖**

```json
"@earendil-works/pi-agent-core": "latest",
"@earendil-works/pi-ai": "latest",
```

Run: `bun add @earendil-works/pi-agent-core @earendil-works/pi-ai`

- [ ] **Step 2: 验证安装**

Run: `bun run typecheck`
Expected: 无新增类型错误（可能有现有 calendar.tsx 错误，与本次无关）

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: 安装 pi-mono 包"
```

---

### Task 2: 统一工具注册表 pi-tool-registry.ts

**Files:**
- Create: `electron/pi-tool-registry.ts`

- [ ] **Step 1: 编写工具注册表**

从 `app/services/agent-tools.ts` 移入 memory_search / memory_add / memory_event / datetime / calculator 实现，适配为 `AgentTool` 格式。

```typescript
import { adaptTool } from "./patch-tool-adapter"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { getRuntimeSettings } from "~/services/settings"
import { getSqliteRuntime } from "./sqlite-runtime"
import { resolveStoragePaths } from "./storage-paths"
import { app } from "electron"
import type { StoragePaths } from "./types"
import fs from "node:fs/promises"
import path from "node:path"

let registry: AgentTool[] = []
let toolCtx: AgentToolRuntimeContext | null = null

export type AgentToolRuntimeContext = {
  getPaths: () => StoragePaths
  runSelect: (dbPath: string, sql: string, params?: unknown[]) => Record<string, unknown>[]
  runExecute: (dbPath: string, sql: string, params?: unknown[]) => void
  embedTexts: (text: string) => Promise<number[]>
}

export function initToolContext(ctx: AgentToolRuntimeContext) {
  toolCtx = ctx
}

function requireCtx(): AgentToolRuntimeContext {
  if (!toolCtx) throw new Error("Agent 工具运行时未初始化")
  return toolCtx
}

// memory_search 工具
const memorySearchTool: AgentTool = {
  name: "memory_search",
  description: "搜索长期记忆中与查询相关的内容",
  parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词" } }, required: ["query"] },
  execute: async (toolCallId, params) => {
    const ctx = requireCtx()
    const rows = ctx.runSelect(ctx.getPaths().databaseFile,
      `SELECT title, category, content FROM memory_items WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 8`,
      [`%${params.query}%`, `%${params.query}%`]
    )
    const text = rows.length === 0 ? "记忆中未找到相关内容" : rows.map((r) => `[${r.category}] ${r.title}\n${r.content}`).join("\n\n")
    return { content: [{ type: "text", text }], details: { count: rows.length } }
  },
}

// memory_add 工具
const memoryAddTool: AgentTool = {
  name: "memory_add",
  description: "将信息写入长期记忆",
  parameters: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, category: { type: "string" } }, required: ["title", "content"] },
  execute: async (toolCallId, params) => {
    const ctx = requireCtx()
    const { memoriesDir, databaseFile } = ctx.getPaths()
    await fs.mkdir(memoriesDir, { recursive: true })
    const now = Date.now()
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21)
    const safeTitle = String(params.title ?? "").replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "").trim().replace(/\s+/g, "_")
    const fileName = `${safeTitle || "memory"}_${now}.md`
    const filePath = path.join(memoriesDir, fileName)
    await fs.writeFile(filePath, `# ${params.title}\n\n${params.content}`, "utf8")
    ctx.runExecute(databaseFile,
      `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, params.title, params.category || "记忆", params.content, filePath, now, now]
    )
    return { content: [{ type: "text", text: `已存入记忆: ${params.title}` }], details: { id } }
  },
}

// datetime 工具
const datetimeTool: AgentTool = {
  name: "datetime",
  description: "获取当前日期、时间和星期",
  parameters: { type: "object", properties: {} },
  execute: async (toolCallId, params) => {
    const now = new Date()
    const text = now.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long" })
    return { content: [{ type: "text", text }], details: {} }
  },
}

// calculator 工具
const calculatorTool: AgentTool = {
  name: "calculator",
  description: "计算数学表达式",
  parameters: { type: "object", properties: { expression: { type: "string", description: "数学表达式，如 2+3*4" } }, required: ["expression"] },
  execute: async (toolCallId, params) => {
    const expr = String(params.expression ?? "")
    const sanitized = expr.replace(/[^0-9+\-*/.() ]/g, "")
    try {
      const result = Function(`"use strict"; return (${sanitized})`)()
      return { content: [{ type: "text", text: `${expr} = ${result}` }], details: { result } }
    } catch {
      return { content: [{ type: "text", text: "计算表达式无效" }], details: { error: true } }
    }
  },
}

// memory_event 工具
const memoryEventTool: AgentTool = {
  name: "memory_event",
  description: "记录一个事件到记忆日志",
  parameters: { type: "object", properties: { content: { type: "string", description: "事件内容" } }, required: ["content"] },
  execute: async (toolCallId, params) => {
    const ctx = requireCtx()
    const { memoriesDir, databaseFile } = ctx.getPaths()
    await fs.mkdir(memoriesDir, { recursive: true })
    const now = Date.now()
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21)
    await fs.writeFile(path.join(memoriesDir, `event_${now}.md`), `# 事件记录\n\n${params.content}`, "utf8")
    ctx.runExecute(databaseFile,
      `INSERT INTO memory_items (id, title, category, content, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, "事件记录", "事件", params.content, "", now, now]
    )
    return { content: [{ type: "text", text: "已记录事件" }], details: { id } }
  },
}

export function getToolRegistry(): AgentTool[] {
  if (registry.length === 0) {
    registry = [memorySearchTool, memoryAddTool, memoryEventTool, datetimeTool, calculatorTool]
  }
  return registry
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/pi-tool-registry.ts
git commit -m "feat: 添加统一工具注册表 pi-tool-registry"
```

---

### Task 3: AgentSessions 管理器 pi-agent.ts

**Files:**
- Create: `electron/pi-agent.ts`

- [ ] **Step 1: 编写 AgentSessions 管理器**

```typescript
import { Agent } from "@earendil-works/pi-agent-core"
import { getModel } from "@earendil-works/pi-ai"
import type { AgentTool, AgentEvent } from "@earendil-works/pi-agent-core"
import { getToolRegistry } from "./pi-tool-registry"
import { getRuntimeSettings } from "~/services/settings"
import type { IpcContext } from "./types"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

interface Session {
  agent: Agent
  unsubscribe: () => Promise<void>
  window: BrowserWindow
}

const sessions = new Map<string, Session>()

export async function createAgentSession(window: BrowserWindow): Promise<string> {
  const sessionId = randomUUID()
  const settings = await getRuntimeSettings()
  const tools = getToolRegistry()

  const ollamaModel = getModel("ollama", settings.llmModel, {
    baseUrl: (settings.ollamaHost || "http://localhost:11434") + "/v1",
    apiKey: "dummy",
  })

  const agent = new Agent({
    initialState: {
      tools,
      model: ollamaModel,
    },
    toolExecution: "sequential",
  })

  const unsubscribe = await agent.subscribe(async (event: AgentEvent) => {
    window.webContents.send("agent:event", { sessionId, event })
  })

  sessions.set(sessionId, { agent, unsubscribe, window })
  return sessionId
}

export async function promptAgent(sessionId: string, message: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error("session not found")
  await session.agent.prompt(message)
}

export async function destroyAgentSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  await session.unsubscribe()
  sessions.delete(sessionId)
}

export function agentSessionExists(sessionId: string): boolean {
  return sessions.has(sessionId)
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/pi-agent.ts
git commit -m "feat: 添加 AgentSessions 管理器"
```

---

### Task 4: 注册 IPC handlers

**Files:**
- Modify: `electron/ipc-handlers.ts`

- [ ] **Step 1: 添加 agent:* handlers**

在 `registerIpcHandlers` 函数末尾添加：

```typescript
import { createAgentSession, promptAgent, destroyAgentSession, agentSessionExists } from "./pi-agent"
import { initToolContext } from "./pi-tool-registry"
import type { BrowserWindow } from "electron"

// agent:create
ipcMain.handle("agent:create", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) throw new Error("no window")
  return createAgentSession(window)
})

// agent:prompt
ipcMain.handle("agent:prompt", async (_event, { sessionId, message }: { sessionId: string; message: string }) => {
  if (!agentSessionExists(sessionId)) throw new Error("session not found")
  await promptAgent(sessionId, message)
  return { ok: true }
})

// agent:destroy
ipcMain.handle("agent:destroy", async (_event, { sessionId }: { sessionId: string }) => {
  await destroyAgentSession(sessionId)
  return { ok: true }
})
```

同时在 `main.ts` 的 `ipcCtx` 之后、`registerIpcHandlers` 调用之前，添加：

```typescript
import { initToolContext } from "./pi-tool-registry"
// ... 在 setAgentToolRuntimeContext 之后添加：
initToolContext({
  getPaths,
  runSelect: (dbPath, sql, params) =>
    getSqliteRuntime().selectStatement(dbPath, sql, params ?? []) as Record<string, unknown>[],
  runExecute: (dbPath, sql, params) => {
    getSqliteRuntime().runStatement(dbPath, sql, params ?? [])
  },
  embedTexts: async (text) => (await ollamaEmbed.embedTexts(text)) as number[],
})
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc-handlers.ts electron/main.ts
git commit -m "feat: 注册 agent:* IPC handlers"
```

---

### Task 5: Renderer IPC 封装 pi-agent-client.ts

**Files:**
- Create: `app/services/pi-agent-client.ts`

- [ ] **Step 1: 编写客户端封装**

```typescript
import { electronClient } from "./electron-client"

export type AgentEventPayload = {
  sessionId: string
  event: {
    type: string
    [key: string]: unknown
  }
}

export async function createAgentSession(): Promise<string> {
  return electronClient.invoke<string>("agent:create", null)
}

export async function promptAgent(sessionId: string, message: string): Promise<{ ok: boolean }> {
  return electronClient.invoke("agent:prompt", { sessionId, message })
}

export async function destroyAgentSession(sessionId: string): Promise<{ ok: boolean }> {
  return electronClient.invoke("agent:destroy", { sessionId })
}

export function subscribeAgentEvents(
  callback: (payload: AgentEventPayload) => void
): () => void {
  return electronClient.on<AgentEventPayload>("agent:event", (_event, payload) => {
    callback(payload)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/services/pi-agent-client.ts
git commit -m "feat: 添加 Renderer 侧 pi-agent IPC 封装"
```

---

### Task 6: 对话页面接入 chat.tsx

**Files:**
- Modify: `app/routes/chat.tsx`

- [ ] **Step 1: useEffect 管理 Agent 会话**

在组件中添加 useEffect，在 mount 时创建 session，cleanup 时销毁：

```typescript
const [sessionId, setSessionId] = useState<string | null>(null)
const [streamedContent, setStreamedContent] = useState("")
const [toolCallName, setToolCallName] = useState<string | null>(null)

useEffect(() => {
  let cancelled = false
  ;(async () => {
    const sid = await createAgentSession()
    if (cancelled) {
      await destroyAgentSession(sid)
      return
    }
    setSessionId(sid)
  })()
  return () => {
    cancelled = true
    if (sessionId) {
      destroyAgentSession(sessionId).catch(console.error)
    }
  }
}, []) // 依赖 []，仅页面挂载/卸载触发
```

订阅事件流：

```typescript
useEffect(() => {
  if (!sessionId) return
  return subscribeAgentEvents((payload) => {
    if (payload.sessionId !== sessionId) return
    const event = payload.event
    if (event.type === "message_update") {
      const delta = (event as any).assistantMessageEvent?.delta
      if (delta) setStreamedContent((prev) => prev + delta)
    }
    if (event.type === "tool_execution_start") {
      setToolCallName((event as any).toolName)
    }
    if (event.type === "tool_execution_end") {
      setToolCallName(null)
    }
    if (event.type === "message_end") {
      setStreamedContent("") // 本轮结束，累加到消息列表
    }
  })
}, [sessionId])
```

发送消息时调用 `promptAgent`：

```typescript
async function handleSend(message: string) {
  if (!sessionId) return
  await promptAgent(sessionId, message)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/chat.tsx
git commit -m "feat: chat.tsx 接入 pi-agent-core"
```

---

## 自检清单

1. **Spec 覆盖**：所有架构图、IPC 通道、工具列表、错误处理均已在 task 中有对应实现
2. **无 placeholder**：所有 code block 均含实际代码，无 TBD/TODO
3. **类型一致性**：AgentSessions 的 `sessionId` 在所有 tasks 中一致（`string` 类型）
4. **工具签名**：适配后的 `AgentTool.execute` 返回 `{ content: [{ type: "text", text }], details }`
5. **Ollama 配置**：`baseUrl` 拼接 `/v1`，apiKey 用 `"dummy"`

---

## 执行方式

**"Plan complete and saved to `docs/superpowers/plans/2026-05-27-pi-mono-agent-plan.md`. Two execution options:**

1. **Subagent-Driven (recommended)** -  dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**