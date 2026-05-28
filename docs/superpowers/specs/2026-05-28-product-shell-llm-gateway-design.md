# 产品壳（工作台任务流）+ LLM Gateway 设计规格

**状态**：已确认方向，待实施计划  
**日期**：2026-05-28  
**锁定决策**：

| 项 | 选择 |
|----|------|
| UX 路线 | **B — 工作台 + 任务流** |
| 视觉与密度 | **C — 偏运营文档（小红书 / 飞书）**：舒展、大按钮、暖色强调、卡片轻阴影 |
| 对话来源 | 用户自配 **Coding Plan / OpenAI 兼容** 为主；Ollama 仅作可选（对话 + Embedding） |

**关联文档**：

- `docs/小红书博主AI运营工作台 · 最终端侧版产品文档.md`
- `docs/playbook-场景与编排架构.md`

---

## 1. 设计目标

1. **运营者每天只记住一条路径**：打开 → 工作台 → 选任务 → 出结果 → 进草稿。
2. **配置退居幕后**：Provider、Skill、输入模板、JSON 不进主导航。
3. **真实状态优先**：未连接、无 Key、生成中、失败原因一律可见可操作（禁止假数据）。
4. **工程可靠**：多厂商模型用 **Vercel AI SDK** 统一网关，禁止主进程手写 `fetch` SSE。

---

## 2. 信息架构（方案 B）

### 2.1 主导航（5 项，固定侧栏或顶栏 Tab）

| 序号 | 标签 | 路由 | 主动作 | 说明 |
|------|------|------|--------|------|
| 1 | 工作台 | `/` | 继续上次 / 选场景 | 聚合：待办、最近草稿、连接状态、一键继续 |
| 2 | 创作 | `/create` | 进入场景任务 | 场景卡片网格（原 playbooks 列表，运营文案） |
| 3 | 草稿 | `/drafts` | 复制发布块 | 列表 + 筛选 |
| 4 | 知识 | `/knowledge` | 搜索 / 新建素材 | 原 knowledge-base；画像作子 Tab |
| 5 | 对话 | `/chat` | 发送 | 高级用户入口，非默认首页 |

**不在主导航**（收入「高级工作室」`/studio` 或设置内链接）：

- Skill、`/studio/skills`
- 输入模板、`/studio/input-profiles`
- 场景 Designer、`/studio/playbook-designer`
- 本地模型管理（Ollama）、`/connect/local-models`（仅 Ollama 模式）

**合并 / 下线**：

- `/models` 塔罗页 → 降级为「AI 连接」内「本地模型」子区
- `/settings` 保留存储路径等；**模型连接迁到 `/connect`**
- `/input-profiles`、`/playbooks/designer` → `/studio/*`
- `home.tsx` 死链 `/creator` → 删除，由 `/` 工作台替代
- `/portrait` → `/knowledge?tab=persona` 或 `/knowledge/persona`

### 2.2 任务流路由

```
/  工作台
/create                    场景列表（任务卡片）
/create/:playbookId        场景运行（采集 → 生成 → 结果）
/drafts
/knowledge[?tab=library|persona]
/chat
/connect                   AI 连接（Coding Plan + 可选 Ollama）
/studio                    高级工作室入口
/studio/skills
/studio/input-profiles
/studio/input-profiles/:id
/studio/playbook-designer
/settings                  存储路径、运行时 CPU 等
```

**兼容重定向（实现期）**：

- `/playbooks` → `/create`
- `/playbooks/:id` → `/create/:id`
- `/playbooks/designer` → `/studio/playbook-designer`

---

## 3. 布局与壳组件

### 3.1 `AppShell`（运营文档风）

```
┌────────────────────────────────────────────────────────────┐
│ [Logo] 工作台                    [模型 pill] [⌘K] [设置]   │  h-14 实底顶栏，非玻璃
├────────┬───────────────────────────────────────────────────┤
│ 工作台 │                                                   │
│ 创作   │              主内容区 max-w-3xl 居中               │
│ 草稿   │              或 任务运行页 max-w-4xl              │
│ 知识   │                                                   │
│ 对话   │                                                   │
│        │                                                   │
│ [连接] │  ← 侧栏底部固定「AI 未连接」或已连接摘要           │
└────────┴───────────────────────────────────────────────────┘
```

- **侧栏**：常开 200–220px（不依赖 hover 展开）；图标 + 文案始终可见。
- **顶栏模型 pill**：`GLM-4.7 · 智谱` / `未配置模型`；点击 → `/connect`。
- **⌘K**：`cmdk`（shadcn Command）全局跳转场景、草稿、设置。

### 3.2 `TaskRunLayout`（场景运行 / 未来创作中心共用）

三态步骤条（非可点击跳步，仅进度指示）：

1. 填写需求  
2. 生成中  
3. 查看结果  

布局（桌面）：

- **上**：场景名 + 一句话说明  
- **中左（或上）**：采集区 — 一句话抽槽 + 极简字段 + 大主按钮「开始生成」  
- **中下**：结果区 — 卡片列表（小红书条目标题/正文/标签）  
- **底栏固定**：耗时、记忆引用数、查看草稿  

### 3.3 `WorkbenchPage`（`/`）

区块顺序：

1. **连接横幅**（仅未配置时）：暖色条 +「去配置 AI」大按钮  
2. **继续上次**（localStorage / DB 有未完成则显示）  
3. **推荐场景**（2–3 张大卡，等同 `/create` 子集）  
4. **最近草稿**（横向滚动或 3 条列表）  
5. **数据概览**（仅真实数据：草稿数、记忆条数；无数据则不显示图表）

---

## 4. 视觉规范（方案 C）

在现有暖色 token（`app.css` 奶油底 + coral primary）上调整用法，**不是换肤**。

| 维度 | 现况 | 目标（C） |
|------|------|-----------|
| 字体 | Fraunces 标题偏多 | **UI 全用 sans（DM Sans / Geist）**；标题字重 600，不用衬线 |
| 圆角 | `rounded-xl` 混杂 | 卡片 `rounded-2xl`；主按钮 `rounded-2xl` h-12 |
| 按钮 | 中等 | **主 CTA 全宽或 ≥200px、字号 15–16px**；次要用 outline |
| 卡片 | 玻璃 `glass-warm` | **实底 `bg-card` + `shadow-sm` + `border border-border/60`** |
| 密度 | 偏紧凑 | 区块 `space-y-8`；卡片内 `p-5`；列表行高 ≥ 48px |
| 强调色 | primary 珊瑚 | 保留；成功/警告用 muted 底 + 彩色左边线（飞书式） |
| 装饰 | 塔罗、3D 画像首屏 | **默认列表/卡片**；3D 仅在「知识 → 画像」可选 Tab |
| 侧栏 | hover 展开 | **常开**，当前项左侧 3px primary 条 |

### 4.1 场景任务卡片（`/create`）

```
┌─────────────────────────────┐
│ [图标]  小红书内容包          │
│         根据选题生成文案与标签 │
│                             │
│ [ 开始创作 ]  主按钮 full width │
└─────────────────────────────┘
```

- 禁用「工程师词汇」：列表标题用「创作任务」而非 Playbook。  
- 「对话创建场景」→ 次级文字链或底部虚线卡片，不进首屏主网格。

### 4.2 空状态

- 插图：简单 lucide + 暖色圆底，不用 3D。  
- 一句说明 + **一个主按钮**（去连接 / 去创作）。  
- 禁止占位统计数字。

---

## 5. 页面级交互要点

### 5.1 `/connect` — AI 连接

**默认展开：Coding Plan / OpenAI 兼容**

- 厂商预设 Select（智谱 / Z.AI / 讯飞 / 自定义）  
- API Key（password）  
- 模型名（带 preset 占位提示）  
- **测试连接** → 显示延迟与成功/失败（AI SDK 单次 `generateText`）  

**折叠区：本机 Ollama**

- 开关「对话也走 Ollama」  
- 地址 + 模型列表（简化列表，无塔罗）  

**折叠区：Embedding**

- 默认说明：记忆检索建议本地 Embedding  
- 选择 Ollama embedding 模型或（远期）远程 embedding  

表单：`react-hook-form` + `zod`；保存 → `runtime_settings` + IPC `sync-runtime-settings`。

### 5.2 `/studio/playbook-designer`

- **左 40%**：对话（意图描述 + 多轮，后续）  
- **右 60%**：结构化预览（字段表、Skill 多选、编译预览 Tab）  
- 底部：**保存为我的任务**（主按钮）；高级「查看 JSON」折叠  

禁止默认露出大 JSON Textarea。

### 5.3 `/chat`

- 顶栏与全局模型 pill 同步  
- 输入框增高（min-h 52px）、发送按钮实心 primary  
- 工具 trace、模型参数收进「⋯」抽屉  

### 5.4 `/settings`

- 仅：存储路径、CPU、关于  
- **不再放** Provider 主表单（已迁 `/connect`）  

---

## 6. LLM Gateway 架构

### 6.1 原则

- **单一配置源**：`runtime_settings.llmProvider`（Zod），渲染进程 SQLite 持久化，启动与保存时 IPC 同步主进程。  
- **单一调用入口**：主进程 `llm-gateway.ts`，对外暴露与现 IPC 相同的 `chatPrompt` / `runChatPromptStream` 签名。  
- **替换**：删除或废弃 `openai-chat-runtime.ts` 手写实现。

### 6.2 依赖（实施时 `bun add`）

```text
ai
@ai-sdk/openai
```

可选后续：`@ai-sdk/anthropic`、`@ai-sdk/ollama`（本地模式）。

Coding Plan **无独立 SDK**；一律：

```typescript
import { createOpenAI } from "@ai-sdk/openai"
import { streamText, generateText } from "ai"

const openai = createOpenAI({
  baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
  apiKey: userKey,
})
// model: openai("GLM-4.7")
```

Preset 表维护于 `src/shared/llm-presets.ts`（或 `src/renderer/app/config/llm-presets.ts`），与 [coding-plans-for-copilot vendors](https://github.com/jqknono/coding-plans-for-copilot) 对齐，**静态数据**即可。

### 6.3 模式切换

| `llmProvider.kind` | 对话实现 | Embedding |
|--------------------|----------|-----------|
| `openai-compatible` | AI SDK `streamText` | 仍可用 Ollama（`ollama` npm） |
| `ollama` | 保留 `ollama/chat-runtime` 或 `@ai-sdk/ollama` | Ollama |

`chat-router.ts` 保留为薄路由层，内部委托 `llm-gateway`。

### 6.4 pi-agent

- `createAgentSession` 从 **同一份** `getSyncedRuntimeSettings()` 读取 `baseURL` / `apiKey` / `model`。  
- 与 `llm-gateway` 共用 preset 解析函数，避免双配置。

### 6.5 Renderer `llm.ts`

- `openai-compatible` 模式：**不再** `formatPrompt` 压成单字符串；IPC 增加 `messages[]` 载荷（或 gateway 侧解析）。  
- `ensureChatModelLoaded`：远程模式只校验 Key + model，不 `ollama pull`。

---

## 7. 与 Playbook 架构对齐

| 架构文档概念 | UI 呈现 |
|--------------|---------|
| Playbook | **创作任务**（卡片） |
| Playbook 运行页 | `/create/:id` + `TaskRunLayout` |
| InputProfile | 运行页内采集；编辑在 `/studio/input-profiles` |
| Designer | `/studio/playbook-designer` |
| LLM Provider | `/connect`，Playbook 只调统一 `chat()` |

`PlaybookRunner` 不变；仅保证 `runPlaybook` → `llm.ts` → gateway。

---

## 8. 实施阶段（供 writing-plans 拆分）

| 阶段 | 内容 | 验收 |
|------|------|------|
| **P0** | AI SDK gateway 替换手写 OpenAI；`/connect` 页；顶栏 model pill；设置迁出 Provider | 智谱 Coding Plan 对话 + 场景生成可用 |
| **P1** | 新 `AppShell` + 5 项导航；`/`` 工作台；`/create` 迁移；路由重定向 | 无死链；运营路径可走通 |
| **P2** | `TaskRunLayout`；Designer 双栏；`/studio` 收纳高级项 | 无默认 JSON 编辑 |
| **P3** | ⌘K；视觉 C token 收紧（去玻璃侧栏、塔罗降级） | 视觉评审通过 |

**明确不做（YAGNI）**：

- LangGraph 编排（产品文档远期）  
- 多 Provider 同时对话对比  
- 内置模型下载（坚持用户自备 API / 可选 Ollama）  

---

## 9. 风险与回退

| 风险 | 缓解 |
|------|------|
| AI SDK 在 Electron 主进程 ESM/CJS | 与现 electron-vite 打包策略一并验证；必要时 gateway 放 preload 隔离 |
| 用户仅有 Ollama | `/connect` 显式切换；工作台横幅引导 |
| 路由变更书签失效 | 301 式前端 `Navigate` 重定向一层 |

---

## 10. 自检（spec review）

- [x] 无 TBD 占位  
- [x] UX B 与视觉 C 全文一致  
- [x] 与 playbook 架构、产品文档不冲突  
- [x] 范围可拆为 P0–P3，单阶段可独立交付  
- [x] Coding Plan 明确为 OpenAI 兼容端点 + AI SDK，非虚构 SDK  

---

**下一步**：用户审阅本文档 → 通过后执行 `writing-plans` 生成 `docs/superpowers/plans/2026-05-28-product-shell-llm-gateway-plan.md`，再按 P0 起实施。
