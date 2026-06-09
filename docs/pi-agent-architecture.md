# Pi-Agent 架构分析：SDK 已有能力与可强化方向

## 概述

Neezy Studio 通过 `@earendil-works/pi-coding-agent` (v0.78) SDK 嵌入 Agent 能力。本文档梳理 SDK 内部已做的事情、当前集成方式的现状，以及可以利用 SDK 钩子强化的方向。

---

## 一、pi-coding-agent SDK 内部已有能力

### 1.1 Agent Loop（核心循环）

SDK 实现了完整的 turn-based 循环：

```
prompt → LLM stream → assistant message → tool calls → tool execution → tool results → 再次 LLM
                                                                                          ↓
                                                                             模型决定停止（无 tool call）→ agent_end
```

关键特性：
- **工具执行模式**：`parallel`（默认）或 `sequential`，支持 per-tool 覆盖
- **beforeToolCall**：工具调用前钩子，可 block、可修改参数
- **afterToolCall**：工具调用后钩子，可修改结果、可设置 `terminate: true` 终止循环
- **shouldStopAfterTurn**：低阶 API，每个 turn 结束后可决定是否终止整个循环
- **Error 自动报告**：工具抛异常自动以 `isError: true` 报给模型，模型自行决定是否重试

### 1.2 Compaction（Context 压缩）

**触发条件：**
```
contextTokens > contextWindow - reserveTokens（默认 16384）
```

**算法流程：**

1. **找切割点**：从最新消息向前累加 token 估算（chars/4 启发式），直到累计 ≥ `keepRecentTokens`（默认 20000）
2. **确定边界**：切割点只能落在 user / assistant / bashExecution / custom 消息上，**永不**切在 toolResult 上
3. **处理 Split Turn**：如果单个 turn 超过预算，会切在 turn 中间的 assistant 消息处，此时生成两份摘要再合并
4. **提取要摘要的消息**：从上次 compaction 的 firstKeptEntryId 到本次切割点之间的所有消息
5. **序列化对话**：`convertToLlm()` → `serializeConversation()` 将消息转为文本格式（`[User]:` / `[Assistant]:` / `[Tool result]:` 等），tool result 截断到 2000 字符
6. **调 LLM 摘要**：用结构化 prompt 生成摘要（Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context）
7. **累积式文件追踪**：从 tool calls 中提取 read/write/edit 文件列表，与前次 compaction 的文件列表合并
8. **保存 CompactionEntry**：写入 JSONL session 文件，包含 summary + firstKeptEntryId + tokensBefore + details
9. **重新加载**：session 重载后，LLM 看到的是 summary + firstKeptEntryId 之后的消息

**摘要 Prompt 格式（SDK 内置）：**

```markdown
## Goal
[用户目标]

## Constraints & Preferences
- [约束/偏好]

## Progress
### Done
- [x] [已完成]
### In Progress
- [ ] [进行中]
### Blocked
- [阻塞项]

## Key Decisions
- **[决策]**: [理由]

## Next Steps
1. [后续步骤]

## Critical Context
- [继续工作所需的关键数据]

<read-files>
path/to/file.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

**增量更新**：如果存在前次摘要（`previousSummary`），使用 UPDATE prompt 让模型在已有摘要基础上合并新信息，而非从头重写。

**Token 估算**：使用 `chars / 4` 保守估算（会高估 token 数），对 image 内容估计 4800 字符。

### 1.3 Session Persistence（会话持久化）

- **JSONL 树状结构**：每条 entry 有 `id` + `parentId`，支持分支
- **Session 版本**：v3
- **操作**：create / open / list / branch / fork / clone
- **Branch Summarization**：切分支时自动摘要离开的分支内容，注入新分支

### 1.4 Steering & Follow-up（运行时消息注入）

- **Steering**：工具执行期间可插入新指令，当前 turn 的工具执行完毕后注入
- **Follow-up**：agent 完全停止后才注入的后续任务
- **模式**：`one-at-a-time`（等回复后送下一条）或 `all`（一次全部送入）

### 1.5 Extension System（扩展系统）

完整事件总线，几十个钩点：

| 事件 | 时机 | 能做什么 |
|------|------|---------|
| `before_agent_start` | prompt 发送前 | 注入消息、修改 systemPrompt |
| `context` | 每次 LLM 调用前 | 修改/裁剪消息列表 |
| `tool_call` | 工具执行前 | block、修改参数 |
| `tool_result` | 工具执行后 | 修改返回结果 |
| `session_before_compact` | compaction 前 | cancel 或提供自定义摘要 |
| `turn_end` | 每个 turn 结束 | 检查状态、决定后续 |
| `agent_end` | 整个 run 结束 | 后处理 |
| `message_end` | 消息完成 | 替换最终消息 |

### 1.6 transformContext（上下文转换）

Agent 初始化时可传入 `transformContext`，在每次 LLM 调用前对消息做任意裁剪/注入：

```typescript
const agent = new Agent({
  transformContext: async (messages, signal) => {
    // 自定义裁剪逻辑
    return prunedMessages;
  },
});
```

### 1.7 其他

- **Thinking Level**：off / minimal / low / medium / high / xhigh，控制模型推理深度
- **Session branching**：树状导航 + 分支摘要
- **File tracking**：累积式跟踪 read/write/edit 文件
- **Tool result truncation**：序列化时自动截断到 2000 字符

---

## 二、Neezy Studio 当前集成方式

### 现状：最小集成

```typescript
// pi-agent.ts 核心流程
const session = await createPiAgentSession({
  cwd, agentDir, model, thinkingLevel,
  customTools: getNeezyCustomTools(),
  sessionManager,
  resourceLoader,
  settingsManager, // compaction: { enabled: true }
});

session.agent.toolExecution = "sequential";
session.setActiveToolsByName(session.getAllTools().map(t => t.name));
await session.prompt(message);
```

### 已使用的 SDK 能力

| 能力 | 用法 |
|------|------|
| Agent Loop | 完全依赖 SDK 内部循环，未做外部编排 |
| Compaction | 开启 `enabled: true`，使用默认参数，未自定义策略 |
| Session Persistence | 通过 SessionManager 持久化，支持恢复 |
| Extensions | 加载了 pi-web-access / pi-textbrowser / pi-permission-system |
| Custom Tools | 5 个 Neezy 工具（记忆搜索/写入、skill 目录/安装） |
| Permission UI | Electron 弹框确认文件写入/bash 执行 |
| Model routing | 动态切换模型 + 百炼兼容修复 |

### 未使用的 SDK 能力

| 能力 | 当前状态 |
|------|---------|
| `transformContext` | 未传入，使用默认 |
| `beforeToolCall` | 未自定义（仅依赖 pi-permission-system 扩展） |
| `afterToolCall` | 未使用 |
| `session_before_compact` | 未自定义 compaction 策略 |
| `before_agent_start` | 未使用 |
| `context` 事件 | 未使用 |
| `followUp` / `steer` | 未使用 |
| `shouldStopAfterTurn` | 未使用 |
| Parallel tool execution | 强制 sequential |
| Tool terminate hint | 未使用 |

---

## 三、可强化方向（按 ROI 排序）

### 3.1 afterToolCall 反馈环（高 ROI）

在工具执行后自动注入验证信息，让模型自行修正：

```typescript
session.agent.afterToolCall = async ({ toolCall, result, isError }) => {
  if (isError) return; // 错误已自动报告
  if (toolCall.name === "write" || toolCall.name === "edit") {
    const diagnostics = await runTypecheck(toolCall.arguments.path);
    if (diagnostics.length > 0) {
      return {
        content: [
          ...result.content,
          { type: "text", text: `\n⚠️ TypeCheck errors:\n${diagnostics.join('\n')}` },
        ],
      };
    }
  }
};
```

**效果**：模型看到编译错误后会自行尝试修复，无需用户手动反馈。

### 3.2 自定义 Compaction 策略（中高 ROI）

利用 `session_before_compact` 事件，针对内容生成场景优化摘要：

```typescript
// 在 extension 中
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  // 保留所有用户原始创意输入的完整内容
  // 只摘要助手的中间推理过程
  // 保留最终 JSON 输出的完整结构
  const customSummary = await generateContentAwareSummary(preparation);
  return {
    compaction: {
      summary: customSummary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    },
  };
});
```

### 3.3 transformContext 动态裁剪（中 ROI）

根据当前任务类型智能裁剪上下文：

```typescript
const session = await createPiAgentSession({
  // ...
});

// SDK 暴露了 agent 实例，可直接设置
session.agent.transformContext = async (messages) => {
  // 1. 移除超过 3 轮的 tool result 详细内容（只保留摘要）
  // 2. 注入与当前对话最相关的记忆片段
  // 3. 去掉重复的文件读取结果
  return optimizedMessages;
};
```

### 3.4 before_agent_start 动态 System Prompt（中 ROI）

根据用户意图动态调整 system prompt：

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  const intent = classifyIntent(event.prompt); // 代码/文案/分析
  const relevantSkill = selectBestSkill(intent);
  return {
    systemPrompt: event.systemPrompt + "\n\n" + relevantSkill.instructions,
  };
});
```

### 3.5 followUp 自动化验证（中 ROI）

agent_end 后自动追加验证/优化步骤：

```typescript
session.subscribe((event) => {
  if (event.type === "agent_end") {
    const output = extractFinalOutput(event.messages);
    if (output && !validateJsonSchema(output, expectedSchema)) {
      session.followUp("输出格式不符合 schema 要求，请修正后重新输出 JSON。");
    }
  }
});
```

### 3.6 Parallel Tool Execution（低 ROI，简单改动）

对不冲突的工具（如同时搜索记忆 + 读文件）启用并行：

```typescript
session.agent.toolExecution = "parallel";

// 对确实需要串行的工具设置 per-tool override
const memorySearchTool = defineTool({
  // ...
  executionMode: "parallel", // 记忆搜索可以并行
});

const writeFileTool = defineTool({
  // ...
  executionMode: "sequential", // 文件写入串行
});
```

### 3.7 beforeToolCall 智能门控（低 ROI，锦上添花）

超越简单的权限弹框：

```typescript
session.agent.beforeToolCall = async ({ toolCall, args, context }) => {
  // 检测影响范围过大的操作
  if (toolCall.name === "bash" && args.command.includes("rm -rf")) {
    return { block: true, reason: "危险操作被阻止" };
  }
  // 自动注入环境变量
  if (toolCall.name === "bash") {
    args.command = `export NODE_ENV=development\n${args.command}`;
  }
};
```

### 3.8 context 事件做消息裁剪（低 ROI）

```typescript
pi.on("context", async (event) => {
  // 限制 tool result 总量
  const filtered = event.messages.map(msg => {
    if (msg.role === "toolResult" && getTextLength(msg) > 5000) {
      return truncateToolResult(msg, 5000);
    }
    return msg;
  });
  return { messages: filtered };
});
```

---

## 四、Compaction 算法详解

### 4.1 完整流程图

```
Session Entries (JSONL tree path)
         │
         ▼
┌─────────────────────────────┐
│  prepareCompaction()         │
│                             │
│  1. 找到上次 CompactionEntry │
│  2. 确定 boundaryStart       │
│     (上次 firstKeptEntryId)  │
│  3. estimateContextTokens()  │
│  4. findCutPoint()           │
│     ← keepRecentTokens=20k  │
│  5. 提取 messagesToSummarize │
│  6. 提取 turnPrefixMessages  │
│     (if split turn)         │
│  7. extractFileOperations()  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  compact()                   │
│                             │
│  if (isSplitTurn) {         │
│    parallel:                │
│    - generateSummary(hist)  │
│    - generateTurnPrefix()   │
│    merge both               │
│  } else {                   │
│    generateSummary(all)     │
│  }                          │
│                             │
│  append <read-files> +      │
│  <modified-files> to summary│
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  SessionManager.save()       │
│                             │
│  写入 CompactionEntry:       │
│  { type: "compaction",      │
│    summary, firstKeptEntryId,│
│    tokensBefore, details }  │
│                             │
│  Session reload:             │
│  LLM sees: summary +        │
│  messages from firstKeptId  │
└─────────────────────────────┘
```

### 4.2 切割点选择算法

```typescript
// 简化伪代码
function findCutPoint(entries, start, end, keepRecentTokens) {
  const cutPoints = findValidCutPoints(entries, start, end);
  // 有效切点：user / assistant / bashExecution / custom / branchSummary
  // 永不切在：toolResult

  let accumulated = 0;
  let cutIndex = cutPoints[0]; // 最保守：保留所有

  // 从最新向前走
  for (let i = end - 1; i >= start; i--) {
    accumulated += estimateTokens(entries[i].message); // chars/4
    if (accumulated >= keepRecentTokens) {
      // 找到此处之后最近的有效切点
      cutIndex = cutPoints.find(c => c >= i);
      break;
    }
  }

  // 判断是否 split turn
  if (cutIndex 不是 user message) {
    turnStartIndex = 向前找到这个 turn 的 user message;
    isSplitTurn = true;
  }

  return { firstKeptEntryIndex: cutIndex, turnStartIndex, isSplitTurn };
}
```

### 4.3 摘要生成细节

**System Prompt（固定）：**
```
You are a context summarization assistant. Your task is to read a conversation
between a user and an AI coding assistant, then produce a structured summary
following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the
conversation. ONLY output the structured summary.
```

**消息序列化**：所有消息先 `convertToLlm()` 再 `serializeConversation()`：
```
[User]: 用户说的话
[Assistant thinking]: 模型内部推理
[Assistant]: 模型回复文本
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: 工具输出（截断到 2000 字符）
```

**增量 vs 全量**：
- 首次 compaction：使用 SUMMARIZATION_PROMPT（从零生成结构化摘要）
- 后续 compaction：使用 UPDATE_SUMMARIZATION_PROMPT（在已有摘要基础上合并新信息）

**Split Turn 处理**：
- 如果单个 turn 太大超出预算，切在 turn 中间
- 并行生成两份摘要：历史摘要 + turn 前缀摘要
- 合并为 `{historySummary}\n---\n**Turn Context (split turn):**\n{prefixSummary}`

**maxTokens 计算**：
- 历史摘要：`min(0.8 * reserveTokens, model.maxTokens)`
- Turn 前缀：`min(0.5 * reserveTokens, model.maxTokens)`

### 4.4 文件追踪

累积式跟踪，跨多次 compaction 保留：
- 从 assistant 的 toolCall blocks 中提取 `read` / `write` / `edit` 工具的 `path` 参数
- 与前次 CompactionEntry.details 中的 readFiles/modifiedFiles 合并
- 最终输出 `readFiles`（只读未修改的）和 `modifiedFiles`（write 或 edit 过的）

---

## 五、架构建议总结

| 层级 | SDK 负责 | Neezy Studio 应该做 |
|------|---------|-------------------|
| Agent Loop | ✅ 完整循环 + 重试 | afterToolCall 注入验证信息 |
| Context 管理 | ✅ Compaction 基础设施 | transformContext 做领域特定裁剪 |
| 摘要质量 | ✅ 通用结构化摘要 | session_before_compact 做内容场景优化 |
| 工具门控 | ✅ beforeToolCall 接口 | 智能门控规则（不只是弹框） |
| Prompt 工程 | ✅ ResourceLoader 加载 skill/context | before_agent_start 动态注入 |
| 后处理 | ✅ agent_end 事件 | followUp 自动验证输出 |
| 执行效率 | ✅ parallel/sequential 模式 | 按工具特性选择并行策略 |

核心原则：**SDK 提供了完善的骨架和钩子，差异化在于往钩子里填什么逻辑**。
