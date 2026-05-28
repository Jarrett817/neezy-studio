# 产品壳 + LLM Gateway 实现计划

> **For agentic workers:** 按 P0 → P1 → P2 → P3 顺序执行；每阶段结束运行 `bun run typecheck` 与 `bun run dev` 冒烟。本项目不新增测试文件，以 typecheck + 手动验收为准。

**Goal:** 工作台任务流（UX B）+ 运营文档风视觉（C）+ 用户自配 Coding Plan（Vercel AI SDK），摆脱手写 OpenAI `fetch` 与玩具化导航。

**Architecture:** 渲染进程 SQLite 存 `runtime_settings` → IPC 同步主进程 `runtime-settings.ts` → `chat-router` 委托 `llm-gateway`（AI SDK）或 `ollama/chat-runtime`；UI 分阶段替换 `AppShell` 与路由。

**Tech Stack:** `ai`、`@ai-sdk/openai`、`react-hook-form`、`zod`、shadcn、electron-vite 6

**Spec:** `docs/superpowers/specs/2026-05-28-product-shell-llm-gateway-design.md`

---

## 文件结构（目标态）

```
src/main/
  llm-gateway.ts          # AI SDK streamText / generateText（新建）
  llm-presets.ts          # 厂商 preset 表（新建）
  chat-router.ts          # 改：委托 llm-gateway
  runtime-settings.ts     # 已有，扩展类型
  openai-chat-runtime.ts  # 删除或留空 re-export（P0 后删）

src/renderer/app/
  config/llm-presets.ts   # 与 main 同步的 preset（新建）
  routes/connect.tsx      # AI 连接页（新建）
  routes/workbench.tsx    # 工作台（P1）
  components/shell/       # AppShellV2、ModelPill、TaskRunLayout（P1–P2）
  services/llm.ts         # 改：messages 路径、连接校验
  services/settings.ts    # 已有 llmProvider
```

---

## P0：LLM Gateway + `/connect`

### Task P0-1: 安装 AI SDK

**Files:** `package.json`

- [ ] Run: `bun add ai @ai-sdk/openai`
- [ ] Run: `bun run typecheck`（允许既有 `calendar.tsx` 错误）

### Task P0-2: Preset 表

**Files:**
- Create: `src/main/llm-presets.ts`
- Create: `src/renderer/app/config/llm-presets.ts`

两文件内容一致：`CODING_PLAN_PRESETS`、`resolvePresetBaseUrl(preset, customUrl)`。

### Task P0-3: 扩展 main bundle 白名单

**Files:** `electron.vite.config.ts`

- [ ] 在 `BUNDLE_MAIN_DEPS` 增加：`ai`、`@ai-sdk/openai`、`@ai-sdk/provider`

### Task P0-4: 实现 `llm-gateway.ts`

**Files:** Create: `src/main/llm-gateway.ts`

职责：

- `loadChatModel` / `unloadChatModel` / `getChatModelStatus` / `resetChatHistory` / `primeChatHistory`
- `chatPrompt(input, options)` → `generateText`
- `runChatPromptStream(input, options, onDelta)` → `streamText`，`onDelta({ segment: 'answer', delta })`
- 从 `getSyncedRuntimeSettings().llmProvider` 读 baseURL、apiKey、model
- `createOpenAI({ baseURL, apiKey })` + `modelId`

### Task P0-5: 接入 `chat-router.ts`

**Files:** Modify: `src/main/chat-router.ts`

- [ ] `usesOpenAiCompatibleChat()` 时全部走 `llm-gateway`，不再 `openai-chat-runtime`

### Task P0-6: IPC 测试连接

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/app/services/electron-client.ts`

- [ ] `app:test-llm-connection` → 主进程 `generateText` 一条 "ping"，返回 `{ ok, latencyMs, error? }`

### Task P0-7: `/connect` 页面

**Files:**
- Create: `src/renderer/app/routes/connect.tsx`
- Modify: `src/renderer/src/App.tsx`（路由 `/connect`）
- Modify: `src/renderer/app/routes/settings.tsx`（移除 Provider 主表单，留链接「AI 连接」）

`react-hook-form` + `zod`；保存调用 `saveRuntimeSettings`；测试连接按钮。

### Task P0-8: 顶栏 Model Pill（最小）

**Files:**
- Create: `src/renderer/app/components/shell/model-pill.tsx`
- Modify: `src/renderer/app/components/app-shell.tsx`（header 内嵌，点击 `/connect`）

### Task P0-9: 删除手写 runtime

**Files:** Delete or stop importing `src/main/openai-chat-runtime.ts`

**P0 验收：** 设置 Coding Plan Key + 模型 → 测试连接成功 → 对话页发消息 → 场景「小红书」生成有流式/非流式回复。

---

## P1：工作台壳 + 导航

### Task P1-1: `AppShellV2`

常开侧栏 5 项 + 顶栏；侧栏底「AI 连接」；视觉 C（实底卡片、无 hover 窄栏）。

### Task P1-2: `workbench.tsx` + `/create` 重命名

- Create: `routes/workbench.tsx`
- Rename route: `playbooks.tsx` → `create.tsx`（或复用组件）
- Redirects: `/playbooks` → `/create`

### Task P1-3: 切换默认路由

- `index` → `WorkbenchRoute`
- 修 `home.tsx` 死链

**P1 验收：** 新用户路径：工作台 → 创作 → 运行 → 草稿。

---

## P2：任务壳 + Studio

### Task P2-1: `TaskRunLayout` 包裹 `playbook-run`

步骤条 + 大主按钮 + 结果区。

### Task P2-2: `/studio` 布局 + 迁移

`/studio/skills`、`input-profiles`、`playbook-designer`；Designer 双栏（对话 + 结构化预览）。

---

## P3：抛光

### Task P3-1: ⌘K Command

shadcn Command 全局。

### Task P3-2: 视觉 C 收尾

去 `glass-warm` 侧栏；`/models` 塔罗仅 Ollama 模式入口；Fraunces 仅保留品牌一处。

---

## Spec 覆盖自检

| Spec § | Task |
|--------|------|
| §2 IA 5 项导航 | P1 |
| §3 AppShell / TaskRunLayout | P1–P2 |
| §4 视觉 C | P1–P3 |
| §5 `/connect` | P0 |
| §6 LLM Gateway | P0 |
| §8 阶段 P0–P3 | 全文 |

---

## 执行方式

计划已保存。建议 **本会话 Inline 执行 P0**，完成后再开新会话做 P1。
