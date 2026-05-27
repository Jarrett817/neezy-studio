# Electron-Vite 迁移 + Pi-Mono Agent 接入 + 清除 Node-Llama-CPP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目迁移到 electron-vite 架构，接入 pi-mono 作为 Agent 引擎，清除所有 node-llama-cpp 相关代码。

**Architecture:** electron-vite 统一打包主进程 + Renderer，pi-agent-core 运行在主进程（经 Vite 打包支持 ESM），工具在主进程直接访问 SQLite/文件系统，Renderer 通过 IPC 与 Agent 通信。

**Tech Stack:** electron-vite, @earendil-works/pi-agent-core, @earendil-works/pi-ai, Ollama

---

## 文件结构（迁移后）

```
src/
  main/                    # electron 主进程（经 Vite 打包）
    index.ts               # main.ts 改名
    pi-agent.ts            # AgentSessions 管理器（新增）
    pi-tool-registry.ts    # 统一工具注册表（新增）
    ipc-handlers.ts        # IPC handlers（改造自 electron/ipc-handlers.ts）
    preload.ts             # preload 脚本
    storage-paths.ts       # （改造自 electron/storage-paths.ts）
    sqlite-runtime.ts      # （改造自 electron/sqlite-runtime.ts）
    ollama/                 # Ollama 相关（保留）
      catalog.ts
      client.ts
      lifecycle.ts
      env.ts
      metrics.ts
      model-info.ts
      thinking.ts
      embed-runtime.ts
      agent-tools.ts       # （新：工具运行时上下文）
  preload/
    index.ts               # preload 入口
  renderer/                # React 应用（Vite 打包）
    app/                   # （改造自 app/）
      agents/llm-agent.ts  # （保留但简化）
      services/
        pi-agent-client.ts # （改造自 app/services/pi-agent-client.ts）
        agent-tools.ts      # （新：Renderer 工具，IPC 代理）
        memories.ts
      routes/
        chat.tsx           # （改造）
electron/                  # （旧目录，迁移后删除）
```

---

### Task 1: 安装 electron-vite

**Files:**
- Modify: `package.json`
- Create: `electron.vite.config.ts`

- [ ] **Step 1: 安装依赖**

```bash
bun add -D electron-vite electron-builder
```

- [ ] **Step 2: 创建 electron.vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@react-router/dev/vite"
import path from "path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {},
})
```

- [ ] **Step 3: 更新 package.json scripts**

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "electron:dev": "electron-vite dev",
    "electron:build": "electron-vite build"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock electron.vite.config.ts
git commit -m "chore: 添加 electron-vite 配置"
```

---

### Task 2: 迁移目录结构

**Files:**
- Create: `src/main/index.ts`（原 electron/main.ts）
- Create: `src/main/pi-agent.ts`（新建）
- Create: `src/main/pi-tool-registry.ts`（新建）
- Create: `src/preload/index.ts`（原 electron/preload.ts 改造）
- Create: `src/renderer/app/`（原 app/ 移入）
- Delete: `electron/`（迁移后删除）

- [ ] **Step 1: 移动 electron/*.ts → src/main/**

```bash
mkdir -p src/main src/preload src/renderer/app
mv electron/main.ts src/main/index.ts
mv electron/preload.ts src/preload/index.ts
mv electron/ipc-handlers.ts src/main/ipc-handlers.ts
mv electron/storage-paths.ts src/main/storage-paths.ts
mv electron/sqlite-runtime.ts src/main/sqlite-runtime.ts
mv electron/types.ts src/main/types.ts
mv electron/ollama src/main/ollama
mv electron/agent-tools-runtime.ts src/main/agent-tools-runtime.ts
mv electron/vector-fallback.ts src/main/vector-fallback.ts
```

- [ ] **Step 2: 移动 app/ → src/renderer/app/**

```bash
mv app src/renderer/app
```

- [ ] **Step 3: 更新 import 路径**

`src/main/index.ts` 中的 import：
- `from "./ollama/..."` 保持
- `from "~/services/..."` → `from "../../renderer/app/services/..."`（或重新配置 alias）
- `from "~/services/settings"` → 从 vite.config 中配置 alias 指向 `src/renderer/app/services/settings`

在 `electron.vite.config.ts` 中配置 alias：
```typescript
resolve: {
  alias: {
    "~": path.resolve(__dirname, "src/renderer/app"),
  },
},
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: 迁移到 electron-vite 目录结构"
```

---

### Task 3: 创建 pi-tool-registry.ts（主进程工具注册表）

**Files:**
- Create: `src/main/pi-tool-registry.ts`

- [ ] **Step 1: 编写工具注册表**

工具列表：memory_search、memory_add、memory_event、datetime、calculator

```typescript
import type { AgentTool } from "@earendil-works/pi-agent-core"
import type { AgentToolRuntimeContext } from "./agent-tools-runtime"
import fs from "node:fs/promises"
import path from "node:path"

export type { AgentToolRuntimeContext }

let toolCtx: AgentToolRuntimeContext | null = null

export function initToolContext(ctx: AgentToolRuntimeContext): void {
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
  return [memorySearchTool, memoryAddTool, memoryEventTool, datetimeTool, calculatorTool]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/pi-tool-registry.ts
git commit -m "feat: 添加 pi-tool-registry 主进程工具注册表"
```

---

### Task 4: 创建 pi-agent.ts（主进程 Agent 管理器）

**Files:**
- Create: `src/main/pi-agent.ts`

- [ ] **Step 1: 编写 AgentSessions 管理器**

```typescript
import { Agent } from "@earendil-works/pi-agent-core"
import type { AgentEvent } from "@earendil-works/pi-agent-core"
import { getToolRegistry } from "./pi-tool-registry"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

interface Session {
  agent: Agent
  unsubscribe: () => Promise<void>
  window: BrowserWindow
}

const sessions = new Map<string, Session>()

function getSettingsPath(): string {
  const { app } = require("electron")
  return path.join(app.getPath("userData"), "settings.json")
}

interface RuntimeSettings {
  llmModel: string
  embeddingModel: string
  chatTier: string
  embeddingTier: string
  ollamaHost?: string
}

async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const fsSync = require("node:fs")
  const path = require("node:path")
  const { app } = require("electron")
  const settingsPath = path.join(app.getPath("userData"), "settings.json")
  try {
    if (fsSync.existsSync(settingsPath)) {
      const content = fsSync.readFileSync(settingsPath, "utf-8")
      return JSON.parse(content) as RuntimeSettings
    }
  } catch {}
  return { llmModel: "", embeddingModel: "", chatTier: "", embeddingTier: "" }
}

export async function createAgentSession(window: BrowserWindow): Promise<string> {
  const sessionId = randomUUID()
  const settings = await getRuntimeSettings()
  const tools = getToolRegistry()

  // pi-ai Ollama 模型配置
  const ollamaModel = {
    id: settings.llmModel || "qwen2.5:7b",
    name: settings.llmModel || "qwen2.5:7b",
    api: "openai-responses" as const,
    provider: "ollama",
    baseUrl: (settings.ollamaHost || "http://localhost:11434") + "/v1",
    reasoning: false,
    input: ["text"] as string[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 8192,
  }

  const agent = new Agent({
    initialState: { tools, model: ollamaModel as any },
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
git add src/main/pi-agent.ts
git commit -m "feat: 添加 pi-agent 主进程 Agent 管理器"
```

---

### Task 5: 注册 IPC handlers（agent:*）

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: 添加 agent:* handlers**

```typescript
import { createAgentSession, promptAgent, destroyAgentSession, agentSessionExists } from "./pi-agent"
import type { BrowserWindow } from "electron"

// 在 registerIpcHandlers 函数末尾添加：
ipcMain.handle("agent:create", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) throw new Error("no window")
  return createAgentSession(window)
})

ipcMain.handle("agent:prompt", async (_event, { sessionId, message }: { sessionId: string; message: string }) => {
  if (!agentSessionExists(sessionId)) throw new Error("session not found")
  await promptAgent(sessionId, message)
  return { ok: true }
})

ipcMain.handle("agent:destroy", async (_event, { sessionId }: { sessionId: string }) => {
  await destroyAgentSession(sessionId)
  return { ok: true }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: 添加 agent:* IPC handlers"
```

---

### Task 6: 初始化 pi-tool-registry 的运行时上下文

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 添加 initToolContext 调用**

在 `setAgentToolRuntimeContext` 之后添加：

```typescript
import { initToolContext } from "./pi-tool-registry"

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
git add src/main/index.ts
git commit -m "feat: 初始化 pi-tool-registry 运行时上下文"
```

---

### Task 7: Renderer IPC 封装 pi-agent-client.ts

**Files:**
- Create: `src/renderer/app/services/pi-agent-client.ts`

- [ ] **Step 1: 编写客户端封装**

```typescript
import { electronClient } from "./electron-client"

export type AgentEventPayload = {
  sessionId: string
  event: { type: string; [key: string]: unknown }
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

export function subscribeAgentEvents(callback: (payload: AgentEventPayload) => void): () => void {
  return electronClient.on<AgentEventPayload>("agent:event", (_event, payload) => {
    callback(payload)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/app/services/pi-agent-client.ts
git commit -m "feat: 添加 Renderer 侧 pi-agent IPC 封装"
```

---

### Task 8: 对话页面接入 chat.tsx

**Files:**
- Modify: `src/renderer/app/routes/chat.tsx`

- [ ] **Step 1: 添加 Agent 会话管理**

在组件中添加：

```typescript
const [sessionId, setSessionId] = useState<string | null>(null)
const [streamedContent, setStreamedContent] = useState("")
const [toolCallName, setToolCallName] = useState<string | null>(null)

useEffect(() => {
  let cancelled = false
  ;(async () => {
    const sid = await createAgentSession()
    if (cancelled) { await destroyAgentSession(sid); return }
    setSessionId(sid)
  })()
  return () => {
    cancelled = true
    if (sessionId) destroyAgentSession(sessionId).catch(console.error)
  }
}, [])

useEffect(() => {
  if (!sessionId) return
  return subscribeAgentEvents((payload) => {
    if (payload.sessionId !== sessionId) return
    const event = payload.event as any
    if (event.type === "message_update") {
      const delta = event.assistantMessageEvent?.delta
      if (delta) setStreamedContent((prev) => prev + delta)
    }
    if (event.type === "tool_execution_start") setToolCallName(event.toolName)
    if (event.type === "tool_execution_end") setToolCallName(null)
    if (event.type === "message_end") {
      const content = streamedContent
      if (content.trim()) { /* 存入消息列表 */ }
      setStreamedContent("")
    }
  })
}, [sessionId])

async function handleSend(message: string) {
  if (!sessionId) return
  await promptAgent(sessionId, message)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/app/routes/chat.tsx
git commit -m "feat: chat.tsx 接入 pi-agent-core"
```

---

### Task 9: 清除 node-llama-cpp 相关代码

**Files:**
- Delete: `src/main/chat-llm-runtime.ts`
- Delete: `src/main/embedding-runtime.ts`
- Delete: `src/main/node-llama-runtime.ts`
- Delete: `src/main/model-catalog.ts`
- Delete: `src/main/model-recommendations.ts`
- Delete: `src/main/llm-insights-policy.ts`
- Delete: `src/main/llm-load-policy.ts`
- Delete: `src/main/gpu-inspect.ts`
- Delete: `src/main/nlc-dist-loader.ts`
- Delete: `src/main/nlc-insights-options.ts`

- [ ] **Step 1: 删除 node-llama-cpp 相关文件**

```bash
# 删除以下文件（全部涉及 node-llama-cpp）
rm src/main/chat-llm-runtime.ts
rm src/main/embedding-runtime.ts
rm src/main/node-llama-runtime.ts
rm src/main/model-catalog.ts
rm src/main/model-recommendations.ts
rm src/main/llm-insights-policy.ts
rm src/main/llm-load-policy.ts
rm src/main/gpu-inspect.ts
rm src/main/nlc-dist-loader.ts
rm src/main/nlc-insights-options.ts
```

- [ ] **Step 2: 更新 index.ts 移除相关引用**

从 `src/main/index.ts` 移除：
- `chat-llama-runtime` 相关 import 和函数
- `embedding-runtime` 相关 import 和函数
- `node-llama-runtime` import
- `model-catalog` import（保留 catalog.ts 的 ollama 相关部分）
- `gpu-inspect`、`llm-insights-policy`、`llm-load-policy` import
- `nlc-dist-loader`、`nlc-insights-options` import

保留：
- `ollama/catalog.ts`、`ollama/client.ts`、`ollama/lifecycle.ts`、`ollama/env.ts`、`ollama/metrics.ts`、`ollama/model-info.ts`、`ollama/thinking.ts`（这些是 Ollama HTTP API，与 node-llama-cpp 无关）

- [ ] **Step 3: 验证构建**

```bash
bun run build
```
Expected: 构建成功，无 node-llama-cpp 相关错误

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: 清除 node-llama-cpp 相关代码"
```

---

### Task 10: 验证 electron-vite dev 能正常启动

**Files:**
- Modify: `src/main/index.ts`（如有需要）

- [ ] **Step 1: 运行 electron-vite dev**

```bash
bun run electron:dev
```

Expected: Electron 窗口打开，无 ERR_PACKAGE_PATH_NOT_EXPORTED 错误，pi-agent-core 正常加载

- [ ] **Step 2: 如有问题，修复后 commit**

```bash
git add -A
git commit -m "fix: 修复 electron-vite 迁移问题"
```

---

## 自检清单

1. **目录结构**：electron/* → src/main/*, app/* → src/renderer/app/*
2. **pi-agent-core** 在主进程正确加载（ESM 经 Vite 打包）
3. **工具注册表** 5 个工具全部实现
4. **IPC handlers** agent:create/agent:prompt/agent:destroy 注册
5. **chat.tsx** 会话创建/销毁/事件订阅
6. **node-llama-cpp** 所有相关文件删除
7. **electron-vite dev** 能正常启动

---

## 执行方式

**"Plan complete and saved to `docs/superpowers/plans/2026-05-27-electron-vite-pi-mono-plan.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**