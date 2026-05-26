# Pi-Mono Agent 集成设计

## 背景

Neezy Studio 当前 `app/agents/llm-agent.ts` 是一个单轮 chat wrapper，没有真正的 ReAct 工具循环。本设计将 `pi-agent-core` + `pi-ai` (Ollama provider) 接入主进程，实现多轮工具调用 Agent。

## 目标

1. 对话 Agent：完整 ReAct 循环 + 多轮工具调用 + 流式输出
2. 统一工具注册表：所有工具在主进程集中注册，Renderer 通过 IPC 管理

## 技术选型

- Agent 引擎：`@earendil-works/pi-agent-core`
- LLM API 封装：`@earendil-works/pi-ai`（Ollama provider，baseUrl: `http://localhost:11434/v1`）
- Agent 运行位置：Electron 主进程（工具复用现有主进程能力）
- 模型配置：复用现有 `settings.ts` 的 `runtime_settings`
- 会话管理：每 Renderer 会话一个 `Agent` 实例

---

## 架构

```
Renderer (React Router 7)
  └── IPC: agent:prompt, agent:unsubscribe
                    │
         ┌──────────▼──────────┐
         │   Main (Electron)     │
         │  ┌─────────────────┐  │
         │  │  AgentSessions  │  │  Map<sessionId, Agent>
         │  │  .prompt()      │  │
         │  │  .unsubscribe()│  │
         │  └────────┬────────┘  │
         │           │            │
         │  ┌────────▼────────┐  │
         │  │  pi-agent-core  │  │  Agent + toolLoop
         │  │  (Agent class)  │  │
         │  └────────┬────────┘  │
         │           │            │
         │  ┌────────▼────────┐  │
         │  │  pi-ai          │  │  getModel("ollama", modelId)
         │  │  Ollama provider│  │
         │  └────────┬────────┘  │
         │           │            │
         │  ┌────────▼────────┐  │
         │  │  Ollama REST   │  │  localhost:11434/v1
         │  └─────────────────┘  │
         │           │            │
         │  ┌────────▼────────┐  │
         │  │  ToolRegistry   │  │  统一工具注册表
         │  │  (AgentTools[]) │  │  memory_search, memory_add, ...
         │  └─────────────────┘  │
         └───────────────────────┘
```

---

## 会话管理

### Agent 实例生命周期

- **创建**：Renderer 页面挂载时（`useEffect`）→ 发 `agent:create` IPC → 主进程创建 `Agent` 实例 + 生成 `sessionId` → 返回 `sessionId` 给 Renderer
- **销毁**：Route 切换或页签关闭时（`useEffect` cleanup）→ 发 `agent:destroy` IPC → 主进程调用 `unsubscribe()` + 销毁实例

### IPC 通道设计

| IPC 名称 | 方向 | Payload | 说明 |
|----------|------|---------|------|
| `agent:create` | Renderer → Main | `{ routePath: string, tools?: string[] }` | 创建会话，返回 `sessionId` |
| `agent:prompt` | Renderer → Main | `{ sessionId, message: string }` | 发送消息 |
| `agent:unsubscribe` | Renderer → Main | `{ sessionId }` | 停止事件推送 |
| `agent:destroy` | Renderer → Main | `{ sessionId }` | 销毁会话 |
| `agent:event` | Main → Renderer | `{ sessionId, event: AgentEvent }` | 主动推送事件 |

### 事件推送机制

Renderer 先发 `agent:create`（得到 `sessionId`），之后发 `agent:prompt`。主进程通过 `sessionId` 找对应 BrowserWindow 的 WebContents 推送 `agent:event`。

---

## 工具注册表

### 位置

`electron/ollama/agent-tools.ts`（现有文件扩展）或新建 `electron/agent-tool-registry.ts`

### 合并策略

现有两套工具：
- `app/services/agent-tools.ts` — memory_search, memory_add, memory_event, datetime, calculator
- `electron/ollama/agent-tools.ts` — memory_search, memory_add（带 SQLite 写入）

合并后统一在主进程注册，Renderer 通过 IPC 注册业务工具的场景暂不支持（按方案 A，所有工具都是主进程工具）。

### AgentTool 适配

`pi-agent-core` 的工具签名：
```typescript
execute: async (
  toolCallId: string,
  params: T,
  signal: AbortSignal,
  onUpdate?: (update: { content: Content[]; details: object }) => void
) => { content: [{ type: "text", text: string }]; details: object }
```

现有工具（`app/services/agent-tools.ts`）签名：
```typescript
execute: (args: Record<string, unknown>) => Promise<ToolResult>
```

需要适配器层转换参数格式和返回值。

### 内置工具

| 工具名 | 功能 | 位置 |
|--------|------|------|
| `memory_search` | 搜索长期记忆 | 主进程 SQLite |
| `memory_add` | 存入长期记忆 | 主进程 SQLite + 文件 |
| `memory_event` | 记录事件 | 主进程 SQLite |
| `datetime` | 获取当前时间 | 主进程 |
| `calculator` | 数学计算 | 主进程 |

---

## 模型配置

### pi-ai Ollama Provider 配置

```typescript
const model = getModel("ollama", runtimeSettings.llmModel, {
  baseUrl: runtimeSettings.ollamaHost + "/v1",
  apiKey: "dummy", // Ollama 不需要真实 key
})
```

- `llmModel` — 从现有 `settings.ts` 的 `runtime_settings.llmModel` 读取
- `ollamaHost` — 从 `runtime_settings.ollamaHost` 读取（如 `http://localhost:11434`）

### 不兼容字段处理

`pi-ai` 的 `Model<'openai-completions'>` 有些 Ollama 不支持的字段（如 `supportsDeveloperRole: false`），通过 `compat` 选项覆盖。

---

## 错误处理

- **工具执行失败**：返回错误信息给 LLM，LLM 决定是否重试或换策略（ReAct 正常流程）
- **Ollama 连接失败**：`pi-ai` 抛出异常，中断当前 Agent 循环，返回错误给 Renderer
- **会话不存在**：主进程返回 `{ error: "session not found" }`，Renderer 提示用户刷新页面

---

## 实现顺序

1. 安装 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`
2. 新建 `electron/pi-agent.ts` — AgentSessions 管理器 + IPC handlers
3. 适配现有工具为 `AgentTool` 格式（适配器层）
4. 新建 `electron/pi-tool-registry.ts` — 统一工具注册表
5. 对接 `settings.ts` 的配置到 `pi-ai` Ollama provider
6. IPC handlers 注册到 `electron/ipc-handlers.ts`
7. Renderer 侧事件监听（`agent:event`）
8. 页面 `useEffect` 创建/销毁 Agent

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `electron/pi-agent.ts` | AgentSessions 会话管理 + IPC 实现 |
| `electron/pi-tool-registry.ts` | 统一工具注册表 |
| `electron/patch-tool-adapter.ts` | 现有工具适配 pi-agent-core 签名 |
| `app/services/pi-agent-client.ts` | Renderer 侧 IPC 封装 |
| `app/routes/chat.tsx` | 对话页面接入 |